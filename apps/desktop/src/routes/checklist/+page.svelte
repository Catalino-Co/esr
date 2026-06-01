<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { generateChecklistPDF } from '@esr/reports';
  import { PdfPreviewModal } from '@esr/ui';

  let woId           = null;
  let workOrder      = null;
  let clientName     = '';
  let checklistItems = [];
  let activeTab      = 'salida';

  // PDF preview
  let showPdfPreview   = false;
  let pdfPreviewUrl    = '';
  let pdfPreviewFile   = '';
  let pdfPreviewTitle  = '';

  async function loadData() {
    woId = $page.url.searchParams.get('wo');
    if (!woId || !window.api?.db) return;

    workOrder = await window.api.db.getOne(`
      SELECT w.*, c.name as client_name
      FROM work_orders w
      LEFT JOIN clients c ON w.client_id = c.id
      WHERE w.id = ?`, [woId]);

    if (workOrder) clientName = workOrder.client_name;
    await loadChecklist();
  }

  async function loadChecklist() {
    const woItems = await window.api.db.get(`
      SELECT wi.item_id, wi.quantity as expected_quantity, i.name as item_name, i.internal_code
      FROM work_order_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [woId]);

    const saved = await window.api.db.get(`
      SELECT * FROM work_order_checklists
      WHERE work_order_id = ? AND type = ?`, [woId, activeTab]);

    checklistItems = woItems.map(wi => {
      const ex = saved.find(s => s.item_id === wi.item_id);
      return {
        item_id:           wi.item_id,
        item_name:         wi.item_name,
        internal_code:     wi.internal_code,
        expected_quantity: wi.expected_quantity,
        actual_quantity:   ex ? ex.actual_quantity : 0,
        is_damaged:        ex ? (ex.is_damaged === 1) : false,
        is_missing:        ex ? (ex.is_missing === 1) : false,
        notes:             ex ? ex.notes : ''
      };
    });
  }

  onMount(() => loadData());

  async function switchTab(tab) {
    await saveChecklist();
    activeTab = tab;
    await loadChecklist();
  }

  function hasMissingQuantity(item) {
    return Number(item.actual_quantity || 0) < Number(item.expected_quantity || 0);
  }

  function isIncidentItem(item) {
    return item.is_damaged || item.is_missing || (activeTab === 'retorno' && hasMissingQuantity(item));
  }

  async function saveChecklist() {
    if (!woId || !window.api) return;
    await window.api.db.run(
      'DELETE FROM work_order_checklists WHERE work_order_id = ? AND type = ?',
      [woId, activeTab]
    );
    for (const item of checklistItems) {
      const isMissing = item.is_missing || (activeTab === 'retorno' && hasMissingQuantity(item));
      item.is_missing = isMissing;

      await window.api.db.run(`
        INSERT INTO work_order_checklists
          (work_order_id, item_id, type, expected_quantity, actual_quantity, is_damaged, is_missing, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [woId, item.item_id, activeTab, item.expected_quantity,
         item.actual_quantity, item.is_damaged ? 1 : 0,
         isMissing ? 1 : 0, item.notes || '']
      );
    }
    checklistItems = [...checklistItems];
  }

  // ── Incidencias automáticas ───────────────────────────────────────────────
  let creatingIncidents  = false;

  async function saveAndReturn() {
    await saveChecklist();

    if (activeTab === 'retorno') {
      const count = await createAutomaticIncidents();
      if (count > 0) {
        alert(`${count} incidencia(s) creada(s) automáticamente.`);
      }
    }

    window.location.href = '/work_orders';
  }

  function buildIncidentCandidates(existingKeys) {
    const candidates = [];

    for (const item of checklistItems) {
      const isMissing = item.is_missing || hasMissingQuantity(item);
      const missingQuantity = Math.max(
        0,
        Number(item.expected_quantity || 0) - Number(item.actual_quantity || 0)
      );

      if (item.is_damaged && !existingKeys.has(`${item.item_id}:daño`)) {
        candidates.push({
          item,
          type: 'daño',
          description: `[Retorno WO-${String(woId).padStart(5,'0')}] ${item.item_name}: daño reportado`
        });
      }

      if (isMissing && !existingKeys.has(`${item.item_id}:faltante`)) {
        const qtyDetail = missingQuantity > 0
          ? `faltante de ${missingQuantity} unidad(es) de ${item.expected_quantity}`
          : 'faltante reportado';
        candidates.push({
          item,
          type: 'faltante',
          description: `[Retorno WO-${String(woId).padStart(5,'0')}] ${item.item_name}: ${qtyDetail}`
        });
      }
    }

    return candidates;
  }

  async function createAutomaticIncidents() {
    if (!workOrder || creatingIncidents) return;
    creatingIncidents = true;
    try {
      const existing = await window.api.db.get(
        `SELECT item_id, type
         FROM incidents
         WHERE work_order_id = ? AND is_active = 1`,
        [woId]
      );
      const existingKeys = new Set();
      for (const incident of existing) {
        const type = incident.type || '';
        if (type.includes('daño')) existingKeys.add(`${incident.item_id}:daño`);
        if (type.includes('faltante')) existingKeys.add(`${incident.item_id}:faltante`);
      }
      const candidates = buildIncidentCandidates(existingKeys);

      for (const candidate of candidates) {
        const desc = candidate.description
                   + (candidate.item.notes ? ` — ${candidate.item.notes}` : '');

        await window.api.db.run(`
          INSERT INTO incidents
            (type, item_id, client_id, work_order_id, date, description, severity, estimated_cost, status, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 'media', ?, 'reportado', 1)`,
          [candidate.type, candidate.item.item_id, workOrder.client_id, woId,
           new Date().toISOString().split('T')[0],
           desc, 0]
        );
      }

      return candidates.length;
    } finally {
      creatingIncidents = false;
    }
  }

  async function printChecklist() {
    await saveChecklist();   // guardar estado actual antes de imprimir
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const printableItems = checklistItems.map(item => ({
      ...item,
      is_missing: item.is_missing || (activeTab === 'retorno' && hasMissingQuantity(item))
    }));
    const { url, filename } = generateChecklistPDF(workOrder, printableItems, activeTab, 'preview', company);
    pdfPreviewUrl   = url;
    pdfPreviewFile  = filename;
    pdfPreviewTitle = activeTab === 'salida'
      ? `Checklist de Salida — WO-${String(woId).padStart(5,'0')}`
      : `Checklist de Retorno — WO-${String(woId).padStart(5,'0')}`;
    showPdfPreview  = true;
  }

  // Atajos globales
  function fillAll()  { checklistItems = checklistItems.map(i => ({...i, actual_quantity: i.expected_quantity})); }
  function clearAll() { checklistItems = checklistItems.map(i => ({...i, actual_quantity: 0})); }

  // Checkbox individual: un click completa / descompleta el ítem
  function toggleComplete(item) {
    if (item.actual_quantity >= item.expected_quantity) {
      item.actual_quantity = 0;
    } else {
      item.actual_quantity = item.expected_quantity;
    }
    checklistItems = [...checklistItems];
  }

  // Contadores de estado
  $: totalItems    = checklistItems.length;
  $: itemsOk       = checklistItems.filter(i => i.actual_quantity >= i.expected_quantity && !isIncidentItem(i)).length;
  $: itemsWarning  = checklistItems.filter(i => i.actual_quantity < i.expected_quantity && !isIncidentItem(i)).length;
  $: itemsIncident = checklistItems.filter(i => isIncidentItem(i)).length;
</script>

<!-- ══════════════════════════════════════════════════════════════ HEADER -->
<div class="top-bar">
  <div class="top-bar-left">
    <a href="/work_orders" class="btn-back">← Órdenes de Trabajo</a>
    <h2 class="page-title">Checklist de Operación</h2>
    {#if workOrder}
      <span class="wo-chip">WO-{String(woId).padStart(5,'0')}</span>
    {/if}
  </div>
  {#if workOrder}
    <button class="btn btn-print" on:click={printChecklist}>
      🖨️ Imprimir Checklist de {activeTab === 'salida' ? 'Salida' : 'Retorno'}
    </button>
  {/if}
</div>

{#if workOrder}

  <!-- Info de la WO -->
  <div class="wo-info-bar">
    <div class="wo-info-block">
      <span class="wo-info-label">Cliente</span>
      <span class="wo-info-value">{clientName}</span>
    </div>
    <div class="wo-info-sep"></div>
    <div class="wo-info-block">
      <span class="wo-info-label">Fecha</span>
      <span class="wo-info-value">{workOrder.date}</span>
    </div>
    {#if workOrder.responsible_person}
    <div class="wo-info-sep"></div>
    <div class="wo-info-block">
      <span class="wo-info-label">Responsable</span>
      <span class="wo-info-value">{workOrder.responsible_person}</span>
    </div>
    {/if}
    {#if workOrder.vehicle}
    <div class="wo-info-sep"></div>
    <div class="wo-info-block">
      <span class="wo-info-label">Vehículo</span>
      <span class="wo-info-value">{workOrder.vehicle}</span>
    </div>
    {/if}
    <div class="wo-info-sep"></div>
    <div class="wo-info-block">
      <span class="wo-info-label">Estado WO</span>
      <span class="wo-info-value status-chip">{workOrder.status.toUpperCase()}</span>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs-row">
    <div class="tabs">
      <button class="tab" class:tab-active={activeTab === 'salida'}
              on:click={() => switchTab('salida')}>
        🚛 Checklist de Salida
      </button>
      <button class="tab" class:tab-active={activeTab === 'retorno'}
              on:click={() => switchTab('retorno')}>
        🏢 Checklist de Retorno
      </button>
    </div>

    <!-- Contadores -->
    {#if totalItems > 0}
    <div class="counters">
      <span class="counter counter-ok">✔ {itemsOk} ok</span>
      {#if itemsWarning > 0}
        <span class="counter counter-warn">⚠ {itemsWarning} cant. baja</span>
      {/if}
      {#if itemsIncident > 0}
        <span class="counter counter-err">✕ {itemsIncident} incidencia(s)</span>
      {/if}
    </div>
    {/if}
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <span class="toolbar-label">Equipos a verificar — {totalItems} ítem(s)</span>
    <div style="display:flex;gap:8px;">
      <button class="btn-sm" on:click={fillAll}>✔ Marcar Todos</button>
      <button class="btn-sm btn-sm-danger" on:click={clearAll}>✕ Limpiar</button>
    </div>
  </div>

  <!-- Tabla -->
  <div class="card table-card">
    <div class="table-wrapper">
      <table class="table checklist-tbl">
        <thead>
          <tr>
            <th style="width:44px;text-align:center;" title="Click para marcar cantidad completa">✓</th>
            <th style="width:90px;">Código</th>
            <th>Ítem</th>
            <th style="width:80px;text-align:center;">Req.</th>
            <th style="width:100px;text-align:center;">Verificado</th>
            {#if activeTab === 'retorno'}
              <th style="width:68px;text-align:center;">¿Daño?</th>
              <th style="width:76px;text-align:center;">¿Faltante?</th>
            {/if}
            <th>Observación</th>
          </tr>
        </thead>
        <tbody>
          {#each checklistItems as item}
            {@const rowIncident = isIncidentItem(item)}
            {@const rowOk      = item.actual_quantity >= item.expected_quantity && !rowIncident}
            {@const rowWarn    = !rowOk && !rowIncident}
            <tr class:row-ok={rowOk} class:row-incident={rowIncident} class:row-warn={rowWarn}>
              <td style="text-align:center;padding:8px 4px;">
                <button class="check-complete"
                        class:check-complete-on={item.actual_quantity >= item.expected_quantity}
                        on:click={() => toggleComplete(item)}
                        title={item.actual_quantity >= item.expected_quantity
                          ? 'Desmarcar — poner en 0'
                          : `Marcar completo (${item.expected_quantity} uds.)`}>
                  {#if item.actual_quantity >= item.expected_quantity}✔{/if}
                </button>
              </td>
              <td><span class="code-pill">{item.internal_code}</span></td>
              <td style="font-weight:500;">{item.item_name}</td>
              <td style="text-align:center;font-size:1.05rem;font-weight:700;">{item.expected_quantity}</td>
              <td style="text-align:center;">
                <input type="number" class="qty-input"
                       bind:value={item.actual_quantity}
                       min="0" max={item.expected_quantity}>
              </td>
              {#if activeTab === 'retorno'}
                <td style="text-align:center;">
                  <label class="check-label" class:check-active={item.is_damaged}>
                    <input type="checkbox" bind:checked={item.is_damaged} class="sr-only">
                    <span class="check-box">{item.is_damaged ? '✔' : ''}</span>
                  </label>
                </td>
                <td style="text-align:center;">
                  <label class="check-label" class:check-active={item.is_missing}>
                    <input type="checkbox" bind:checked={item.is_missing} class="sr-only">
                    <span class="check-box">{item.is_missing ? '✔' : ''}</span>
                  </label>
                </td>
              {/if}
              <td>
                <input type="text" class="note-input"
                       bind:value={item.notes}
                       placeholder="Nota (opcional)…">
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="{activeTab === 'retorno' ? 8 : 6}"
                  style="text-align:center;color:var(--text-muted);padding:30px;">
                Esta orden no tiene equipos asignados.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Footer de acciones -->
  <div class="footer-actions">
    <button class="btn btn-print-sm" on:click={printChecklist}>
      🖨️ Imprimir Checklist de {activeTab === 'salida' ? 'Salida' : 'Retorno'}
    </button>
    <button class="btn btn-primary btn-save" on:click={saveAndReturn} disabled={creatingIncidents}>
      {creatingIncidents ? 'Creando incidencias…' : '💾 Guardar Checklist'}
    </button>
  </div>

{:else}
  <div class="empty-state">
    <span style="font-size:2.5rem;">📋</span>
    <p>Cargando información de la orden o ID no válido.</p>
  </div>
{/if}

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFile} title={pdfPreviewTitle} />

<style>
  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .top-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .top-bar-left { display:flex; align-items:center; gap:12px; }
  .btn-back {
    background:none; border:1px solid var(--border-color);
    border-radius:var(--radius-sm); padding:6px 12px;
    text-decoration:none; font-size:.88rem; color:var(--text-muted); transition:.2s;
  }
  .btn-back:hover { background:var(--bg-color); color:var(--text-main); }
  .page-title { margin:0; font-size:1.25rem; font-weight:700; }
  .wo-chip {
    background:rgba(67,94,190,.1); color:var(--primary);
    font-weight:700; font-size:.82rem; padding:3px 10px; border-radius:20px;
  }

  /* ── Print button ────────────────────────────────────────────────────── */
  .btn-print {
    background: #1e293b; color:white; border:none;
    border-radius:var(--radius-sm); padding:8px 16px;
    font-size:.88rem; font-weight:600; cursor:pointer; transition:.2s;
    display:flex; align-items:center; gap:6px;
  }
  .btn-print:hover { background:#0f172a; }
  .btn-print-sm {
    background:white; color:var(--text-main);
    border:1px solid var(--border-color); border-radius:var(--radius-sm);
    padding:9px 16px; font-size:.88rem; font-weight:600;
    cursor:pointer; transition:.2s; display:flex; align-items:center; gap:6px;
  }
  .btn-print-sm:hover { background:var(--bg-color); border-color:#999; }

  /* ── WO info bar ─────────────────────────────────────────────────────── */
  .wo-info-bar {
    display:flex; align-items:center; flex-wrap:wrap; gap:0;
    background:rgba(67,94,190,.04); border:1px solid rgba(67,94,190,.15);
    border-radius:var(--radius-sm); padding:12px 18px; margin-bottom:16px;
  }
  .wo-info-block { display:flex; flex-direction:column; padding:0 16px; }
  .wo-info-block:first-child { padding-left:0; }
  .wo-info-sep { width:1px; height:30px; background:rgba(67,94,190,.2); }
  .wo-info-label { font-size:.72rem; color:var(--text-muted); font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
  .wo-info-value { font-size:.9rem; font-weight:600; color:var(--text-main); margin-top:2px; }
  .status-chip { color:var(--primary); }

  /* ── Tabs ────────────────────────────────────────────────────────────── */
  .tabs-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:0; }
  .tabs { display:flex; border-bottom:2px solid var(--border-color); flex:1; }
  .tab {
    background:none; border:none; padding:12px 22px;
    font-size:.95rem; font-weight:600; color:var(--text-muted);
    cursor:pointer; border-bottom:3px solid transparent; margin-bottom:-2px; transition:.15s;
  }
  .tab:hover { color:var(--text-main); }
  .tab-active { color:var(--primary); border-bottom-color:var(--primary); }

  /* ── Counters ────────────────────────────────────────────────────────── */
  .counters { display:flex; gap:8px; padding-left:16px; }
  .counter {
    font-size:.75rem; font-weight:700; padding:3px 10px;
    border-radius:20px;
  }
  .counter-ok   { background:rgba(40,167,69,.1);  color:var(--success); }
  .counter-warn { background:rgba(255,193,7,.12); color:#b45309; }
  .counter-err  { background:rgba(220,53,69,.1);  color:var(--danger); }

  /* ── Toolbar ─────────────────────────────────────────────────────────── */
  .toolbar {
    display:flex; justify-content:space-between; align-items:center;
    padding:10px 4px; margin-bottom:4px;
  }
  .toolbar-label { font-size:.88rem; font-weight:600; color:var(--text-muted); }
  .btn-sm {
    background:var(--bg-color); border:1px solid var(--border-color);
    border-radius:4px; padding:5px 12px; font-size:.8rem; font-weight:600;
    cursor:pointer; transition:.15s;
  }
  .btn-sm:hover { background:#e9ecef; }
  .btn-sm-danger { color:var(--danger); border-color:rgba(220,53,69,.3); }
  .btn-sm-danger:hover { background:rgba(220,53,69,.06); }

  /* ── Table card ──────────────────────────────────────────────────────── */
  .table-card { padding:0; overflow:hidden; margin-bottom:14px; }
  .checklist-tbl { margin:0; }
  .checklist-tbl thead th {
    position:sticky; top:0; background:var(--bg-color); z-index:1;
    font-size:.77rem;
  }

  /* ── Row states ──────────────────────────────────────────────────────── */
  .row-ok       { background:rgba(40,167,69,.04) !important; }
  .row-warn     { background:rgba(255,193,7,.07) !important; }
  .row-incident { background:rgba(220,53,69,.06) !important; }

  /* ── Code pill ───────────────────────────────────────────────────────── */
  .code-pill {
    display:inline-block; font-size:.7rem; font-weight:600;
    background:rgba(67,94,190,.08); color:var(--primary);
    border-radius:3px; padding:1px 5px; font-family:monospace;
  }

  /* ── Qty input ───────────────────────────────────────────────────────── */
  .qty-input {
    width:72px; text-align:center; padding:5px 6px;
    border:1px solid var(--border-color); border-radius:4px;
    font-size:.95rem; font-weight:700; outline:none;
  }
  .qty-input:focus { border-color:var(--primary); }

  /* ── Checkbox completo (verde, 1 click) ──────────────────────────────── */
  .check-complete {
    width:32px; height:32px;
    border:2px solid var(--border-color);
    border-radius:6px;
    background:white;
    cursor:pointer;
    font-size:.9rem; font-weight:700;
    color:transparent;
    display:flex; align-items:center; justify-content:center;
    transition:all .15s;
    padding:0;
  }
  .check-complete:hover {
    border-color:var(--success);
    background:rgba(40,167,69,.07);
  }
  .check-complete-on {
    background:rgba(40,167,69,.12);
    border-color:var(--success);
    color:var(--success);
  }
  .check-complete-on:hover {
    background:rgba(220,53,69,.07);
    border-color:var(--danger);
    color:rgba(220,53,69,.5);
  }

  /* ── Checkbox visual (daño / faltante) ───────────────────────────────── */
  .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
  .check-label { display:inline-flex; cursor:pointer; }
  .check-box {
    width:26px; height:26px; border:2px solid var(--border-color);
    border-radius:4px; display:flex; align-items:center; justify-content:center;
    font-size:.85rem; transition:.15s; color:var(--danger);
  }
  .check-active .check-box {
    background:rgba(220,53,69,.1); border-color:var(--danger);
    font-weight:700;
  }

  /* ── Note input ──────────────────────────────────────────────────────── */
  .note-input {
    width:100%; padding:5px 8px;
    border:1px solid var(--border-color); border-radius:4px;
    font-size:.85rem; outline:none;
  }
  .note-input:focus { border-color:var(--primary); }

  /* ── Footer ──────────────────────────────────────────────────────────── */
  .footer-actions {
    display:flex; justify-content:flex-end; align-items:center;
    gap:12px; padding:4px 0 8px;
  }
  .btn-save { padding:10px 28px; font-size:.95rem; font-weight:700; }

  /* ── Empty state ─────────────────────────────────────────────────────── */
  .empty-state {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:60px 20px; color:var(--text-muted); gap:12px; text-align:center;
  }

</style>
