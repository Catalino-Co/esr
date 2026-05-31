<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { generateConducePDF } from '$lib/utils/pdfGenerator';
  import { PdfPreviewModal } from '@esr/ui';
  import { fmt } from '$lib/utils/format';

  // ── Estado principal ──────────────────────────────────────────────────────
  let isEditing = false;
  let isSaving  = false;
  let conduceId = null;

  let currentConduce = {
    id: null, work_order_id: null, client_id: null,
    date: new Date().toISOString().split('T')[0],
    status: 'emitido', driver_or_vehicle: '', notes: '',
    subtotal: 0, discount: 0, total: 0
  };

  // ── Búsqueda de Orden de Trabajo ──────────────────────────────────────────
  let workOrders    = [];
  let woSearch      = '';
  let woFocused     = false;
  let selectedWO    = null;
  let importing     = false;

  $: filteredWOs = workOrders.filter(wo => {
    if (!woSearch.trim()) return true;
    const s = woSearch.toLowerCase();
    return String(wo.id).padStart(5,'0').includes(s)
        || (wo.client_name || '').toLowerCase().includes(s);
  });

  function selectWO(wo) {
    selectedWO                   = wo;
    currentConduce.work_order_id = wo.id;
    currentConduce.client_id     = wo.client_id;
    woSearch                     = `WO-${String(wo.id).padStart(5,'0')} — ${wo.client_name}`;
    woFocused                    = false;
    clientName                   = wo.client_name || '';
  }

  function clearWO() {
    selectedWO                   = null;
    currentConduce.work_order_id = null;
    currentConduce.client_id     = null;
    woSearch                     = '';
    clientName                   = '';
  }

  let clientName = '';

  async function importFromWO() {
    if (!currentConduce.work_order_id) return;
    importing = true;
    try {
      const items = await window.api.db.get(`
        SELECT wi.item_id, wi.quantity, i.name, i.internal_code, i.rental_price as price
        FROM work_order_items wi
        JOIN items i ON wi.item_id = i.id
        WHERE wi.work_order_id = ?`, [currentConduce.work_order_id]);

      conduceItems = items.map(i => ({
        item_id:       i.item_id,
        name:          i.name,
        internal_code: i.internal_code,
        quantity:      i.quantity,
        price:         i.price || 0,
        total:         i.quantity * (i.price || 0)
      }));
      calculateTotals();
    } finally {
      importing = false;
    }
  }

  // ── Items del conduce ─────────────────────────────────────────────────────
  let conduceItems = [];

  function updateLine(i) {
    conduceItems[i].total = conduceItems[i].quantity * conduceItems[i].price;
    conduceItems = [...conduceItems];
    calculateTotals();
  }

  function removeLine(i) {
    conduceItems.splice(i, 1);
    conduceItems = [...conduceItems];
    calculateTotals();
  }

  function calculateTotals() {
    currentConduce.subtotal = conduceItems.reduce((s, i) => s + i.total, 0);
    currentConduce.total    = currentConduce.subtotal - (Number(currentConduce.discount) || 0);
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  let showPdfPreview  = false;
  let pdfPreviewUrl   = '';
  let pdfPreviewFile  = '';
  let pdfPreviewTitle = '';

  async function openPDF() {
    calculateTotals();
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const printObj = {
      ...currentConduce,
      id:          currentConduce.work_order_id,
      conduce_id:  currentConduce.id,
      client_name: clientName,
      date:        currentConduce.date
    };
    const { url, filename } = generateConducePDF(printObj, conduceItems, 'preview', company);
    pdfPreviewUrl   = url;
    pdfPreviewFile  = filename;
    pdfPreviewTitle = `Conduce COND-${String(currentConduce.id).padStart(5,'0')}`;
    showPdfPreview  = true;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    conduceId = params.get('id');
    isEditing = !!conduceId;
    const preloadWoId = params.get('wo');   // viene desde WO edit cuando no hay conduce

    if (!window.api?.db) return;

    workOrders = await window.api.db.get(`
      SELECT w.id, w.client_id, w.date, c.name as client_name
      FROM work_orders w
      LEFT JOIN clients c ON w.client_id = c.id
      WHERE w.is_active = 1
      ORDER BY w.id DESC`);

    // Si viene con ?wo=X preseleccionar esa WO y cargar sus equipos
    if (!isEditing && preloadWoId) {
      const wo = workOrders.find(w => w.id === parseInt(preloadWoId))
              || await window.api.db.getOne(`
                   SELECT w.id, w.client_id, w.date, c.name as client_name
                   FROM work_orders w LEFT JOIN clients c ON w.client_id = c.id
                   WHERE w.id = ?`, [preloadWoId]);
      if (wo) {
        selectWO(wo);
        await importFromWO();
      }
    }

    if (isEditing) {
      const cond = await window.api.db.getOne('SELECT * FROM conduces WHERE id = ?', [conduceId]);
      if (cond) {
        currentConduce = { ...cond };
        const wo = workOrders.find(w => w.id === cond.work_order_id);
        if (wo) {
          selectedWO  = wo;
          woSearch    = `WO-${String(wo.id).padStart(5,'0')} — ${wo.client_name}`;
          clientName  = wo.client_name || '';
        } else {
          // WO podría no estar activa — buscarla igualmente
          const woRow = await window.api.db.getOne(`
            SELECT w.id, w.client_id, w.date, c.name as client_name
            FROM work_orders w LEFT JOIN clients c ON w.client_id = c.id
            WHERE w.id = ?`, [cond.work_order_id]);
          if (woRow) {
            selectedWO = woRow;
            woSearch   = `WO-${String(woRow.id).padStart(5,'0')} — ${woRow.client_name}`;
            clientName = woRow.client_name || '';
          }
        }
      }

      const rows = await window.api.db.get(`
        SELECT ci.item_id, ci.quantity, ci.price, i.name, i.internal_code
        FROM conduce_items ci JOIN items i ON ci.item_id = i.id
        WHERE ci.conduce_id = ?`, [conduceId]);

      conduceItems = rows.map(r => ({
        item_id:       r.item_id,
        name:          r.name,
        internal_code: r.internal_code,
        quantity:      r.quantity,
        price:         r.price || 0,
        total:         r.quantity * (r.price || 0)
      }));
      calculateTotals();
    }
  });

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function saveConduce() {
    if (!currentConduce.work_order_id) { alert('Seleccione una Orden de Trabajo.'); return; }
    isSaving = true;
    calculateTotals();
    try {
      let id;
      if (isEditing) {
        await window.api.db.run(`
          UPDATE conduces SET
            work_order_id=?, client_id=?, date=?, status=?,
            driver_or_vehicle=?, notes=?, subtotal=?, discount=?, total=?
          WHERE id=?`,
          [currentConduce.work_order_id, currentConduce.client_id, currentConduce.date,
           currentConduce.status, currentConduce.driver_or_vehicle, currentConduce.notes,
           currentConduce.subtotal, currentConduce.discount, currentConduce.total,
           currentConduce.id]);
        await window.api.db.run('DELETE FROM conduce_items WHERE conduce_id=?', [currentConduce.id]);
        id = currentConduce.id;
      } else {
        const res = await window.api.db.run(`
          INSERT INTO conduces
            (work_order_id, client_id, date, status, driver_or_vehicle, notes, subtotal, discount, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [currentConduce.work_order_id, currentConduce.client_id, currentConduce.date,
           currentConduce.status, currentConduce.driver_or_vehicle, currentConduce.notes,
           currentConduce.subtotal, currentConduce.discount, currentConduce.total]);
        id = res.id;
      }
      for (const ci of conduceItems) {
        if (ci.quantity > 0) {
          await window.api.db.run(
            'INSERT INTO conduce_items (conduce_id, item_id, quantity, price) VALUES (?, ?, ?, ?)',
            [id, ci.item_id, ci.quantity, ci.price]);
        }
      }
      goto('/conduces');
    } catch (err) {
      alert('Error al guardar el conduce.');
      console.error(err);
    } finally {
      isSaving = false;
    }
  }
</script>

<!-- ══════════════════════════════════════════════════════════════ TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    <button class="btn-back" on:click={() => goto('/conduces')}>← Conduces</button>
    <h2 class="page-title">
      {#if isEditing}
        Conduce <span style="color:var(--primary);">COND-{String(currentConduce.id ?? '').padStart(5,'0')}</span>
      {:else}
        Nuevo Conduce
      {/if}
    </h2>
    {#if isEditing}
      <span class="badge badge-{currentConduce.status === 'entregado' ? 'success'
        : currentConduce.status === 'emitido' ? 'primary' : 'secondary'}">
        {currentConduce.status?.toUpperCase()}
      </span>
    {/if}
  </div>
  <div style="display:flex;gap:10px;">
    {#if isEditing}
      <button class="btn btn-secondary" on:click={openPDF}>🖨️ Ver PDF</button>
    {/if}
    <button class="btn btn-primary" on:click={saveConduce} disabled={isSaving}>
      {isSaving ? 'Guardando…' : '💾 Guardar'}
    </button>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════ DATOS GENERALES -->
<div class="card info-card">

  <!-- Selector de WO -->
  <div class="import-box">
    <div class="import-label">🚚 Orden de Trabajo de origen <span class="import-hint">(requerida)</span></div>
    <div class="import-row">
      <div class="combo-wrap">
        <div class="combo-row" class:combo-active={!!selectedWO}>
          <span class="combo-icon">📋</span>
          <input type="text" class="combo-input"
                 placeholder="Buscar por Nº o nombre de cliente…"
                 bind:value={woSearch}
                 on:focus={() => woFocused = true}
                 on:blur={() => setTimeout(() => woFocused = false, 180)} />
          {#if selectedWO}
            <button class="clear-btn" on:click={clearWO} title="Limpiar">✕</button>
          {/if}
        </div>
        {#if woFocused && filteredWOs.length > 0}
          <div class="combo-dropdown">
            {#each filteredWOs.slice(0, 12) as wo (wo.id)}
              <button class="combo-option" class:selected={wo.id === currentConduce.work_order_id}
                      on:mousedown={() => selectWO(wo)}>
                <span class="combo-option-main">
                  <span class="code-pill">WO-{String(wo.id).padStart(5,'0')}</span>
                  {wo.client_name || '—'}
                </span>
                <span class="combo-option-sub">{wo.date}</span>
              </button>
            {/each}
            {#if filteredWOs.length > 12}
              <div class="combo-more">+{filteredWOs.length - 12} más…</div>
            {/if}
          </div>
        {/if}
      </div>
      <button class="btn btn-primary" on:click={importFromWO}
              disabled={!currentConduce.work_order_id || importing}>
        {importing ? 'Cargando…' : '⬇ Cargar Equipos'}
      </button>
    </div>
    {#if clientName}
      <div class="client-tag">👤 {clientName}</div>
    {/if}
  </div>

  <div class="divider"></div>

  <!-- Campos -->
  <div class="info-row">
    <div class="field">
      <label>Fecha de Emisión</label>
      <input type="date" class="form-control" bind:value={currentConduce.date}>
    </div>
    <div class="field field-lg">
      <label>Chofer / Vehículo</label>
      <input type="text" class="form-control" placeholder="Ej. Juan (Ficha 04)"
             bind:value={currentConduce.driver_or_vehicle}>
    </div>
    {#if isEditing}
    <div class="field">
      <label>Estado</label>
      <select class="form-control" bind:value={currentConduce.status}>
        <option value="emitido">Emitido</option>
        <option value="entregado">Entregado</option>
        <option value="anulado">Anulado</option>
      </select>
    </div>
    {/if}
  </div>
</div>

<!-- ══════════════════════════════════════════════════ PANEL PRINCIPAL -->
<div class="main-panel">

  <!-- ─── Tabla de artículos ─────────────────────────────────────────────── -->
  <div class="card items-card">
    <div class="section-title">
      <span>📦 Artículos a Entregar</span>
      <span class="badge-count">{conduceItems.length} ítem(s)</span>
    </div>

    {#if conduceItems.length === 0}
      <div class="empty-state">
        <span style="font-size:2rem;">📦</span>
        <p>Selecciona una Orden de Trabajo y haz click en <strong>Cargar Equipos</strong>.</p>
      </div>
    {:else}
      <div class="items-table-wrap">
        <table class="table" style="margin:0;">
          <thead>
            <tr>
              <th style="width:90px;">Código</th>
              <th>Ítem</th>
              <th style="width:80px;text-align:center;">Cant.</th>
              <th style="width:110px;text-align:right;">Precio Unit.</th>
              <th style="width:110px;text-align:right;">Total</th>
              <th style="width:32px;"></th>
            </tr>
          </thead>
          <tbody>
            {#each conduceItems as ci, i}
              <tr>
                <td><span class="code-pill">{ci.internal_code || '—'}</span></td>
                <td style="font-weight:500;">{ci.name}</td>
                <td>
                  <input type="number" min="0" class="qty-mini"
                         style="width:60px;text-align:center;"
                         bind:value={ci.quantity} on:input={() => updateLine(i)}
                         aria-label="Cantidad">
                </td>
                <td style="text-align:right;">
                  <input type="number" step="0.01" min="0" class="qty-mini"
                         style="width:90px;text-align:right;"
                         bind:value={ci.price} on:input={() => updateLine(i)}
                         aria-label="Precio">
                </td>
                <td style="text-align:right;font-weight:600;white-space:nowrap;">
                  ${fmt(ci.total)}
                </td>
                <td>
                  <button class="btn-remove" on:click={() => removeLine(i)} title="Quitar">🗑️</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- ─── Panel derecho: totales + notas ─────────────────────────────────── -->
  <div class="right-panel">

    <!-- Totales -->
    <div class="card" style="margin:0;">
      <div class="section-title">💰 Resumen</div>

      <div class="totals-box">
        <div class="totals-row">
          <span>Subtotal</span>
          <span>${fmt(currentConduce.subtotal)}</span>
        </div>
        <div class="totals-row">
          <span>Descuento</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="color:var(--text-muted);">$</span>
            <input type="number" min="0" step="0.01" class="discount-input"
                   bind:value={currentConduce.discount}
                   on:input={calculateTotals}
                   aria-label="Descuento">
          </div>
        </div>
        <div class="totals-row total-final">
          <span>TOTAL</span>
          <span>${fmt(currentConduce.total)}</span>
        </div>
      </div>
    </div>

    <!-- Notas -->
    <div class="card" style="margin:0;">
      <div class="section-title">📝 Notas / Observaciones</div>
      <textarea class="form-control" rows="5"
                placeholder="Observaciones del conduce, instrucciones de entrega…"
                bind:value={currentConduce.notes}></textarea>
    </div>

  </div>
</div>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFile} title={pdfPreviewTitle} />

<style>
  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .top-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .top-bar-left { display:flex; align-items:center; gap:12px; }
  .btn-back {
    background:none; border:1px solid var(--border-color);
    border-radius:var(--radius-sm); padding:6px 12px;
    cursor:pointer; font-size:.88rem; color:var(--text-muted); transition:.2s;
  }
  .btn-back:hover { background:var(--bg-color); color:var(--text-main); }
  .page-title { margin:0; font-size:1.25rem; font-weight:700; }

  /* ── Info card ───────────────────────────────────────────────────────── */
  .info-card { padding:16px 18px; }
  .info-row  { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; }
  .field     { display:flex; flex-direction:column; min-width:130px; }
  .field-lg  { flex:1.5; min-width:200px; }
  .divider   { border:none; border-top:1px solid var(--border-color); margin:14px 0; }

  /* ── Import / WO selector ────────────────────────────────────────────── */
  .import-box {
    background:rgba(67,94,190,.04); border:1px dashed rgba(67,94,190,.35);
    border-radius:var(--radius-sm); padding:12px 14px;
  }
  .import-label { font-size:.82rem; font-weight:600; color:var(--primary); margin-bottom:8px; }
  .import-hint  { font-weight:400; color:var(--text-muted); }
  .import-row   { display:flex; gap:10px; align-items:center; }
  .combo-wrap   { flex:1; position:relative; }
  .client-tag   {
    margin-top:8px; font-size:.82rem; color:var(--text-muted);
    background:rgba(67,94,190,.06); border-radius:4px; padding:4px 10px;
    display:inline-block;
  }

  /* ── Combobox ────────────────────────────────────────────────────────── */
  .combo-row {
    display:flex; align-items:center; gap:6px;
    border:1px solid var(--border-color); border-radius:var(--radius-sm);
    padding:6px 10px; background:white; transition:.15s;
  }
  .combo-row:focus-within { border-color:var(--primary); }
  .combo-active { border-color:var(--primary); background:rgba(67,94,190,.03); }
  .combo-icon  { opacity:.45; font-size:.9rem; flex-shrink:0; }
  .combo-input { flex:1; border:none; outline:none; font-size:.9rem; background:transparent; min-width:0; }
  .combo-dropdown {
    position:absolute; top:calc(100% + 4px); left:0; right:0;
    background:white; border:1px solid var(--border-color);
    border-radius:var(--radius-sm); box-shadow:0 4px 18px rgba(0,0,0,.1);
    z-index:200; max-height:280px; overflow-y:auto;
  }
  .combo-option {
    width:100%; background:none; border:none; cursor:pointer;
    padding:8px 12px; text-align:left; display:flex;
    justify-content:space-between; align-items:center; transition:background .1s;
  }
  .combo-option:hover   { background:var(--bg-color); }
  .combo-option.selected { background:rgba(67,94,190,.07); }
  .combo-option-main { font-weight:500; font-size:.88rem; display:flex; align-items:center; gap:6px; }
  .combo-option-sub  { color:var(--text-muted); font-size:.78rem; }
  .combo-more { padding:6px 12px; font-size:.78rem; color:var(--text-muted); }
  .clear-btn {
    background:none; border:none; cursor:pointer;
    color:var(--text-muted); font-size:.8rem; padding:0 2px; flex-shrink:0;
  }
  .clear-btn:hover { color:var(--danger); }

  /* ── Main panel ──────────────────────────────────────────────────────── */
  .main-panel {
    display:grid;
    grid-template-columns: 1fr 320px;
    gap:16px; align-items:start;
  }
  .items-card  { margin:0; padding:0; overflow:hidden; }
  .right-panel { display:flex; flex-direction:column; gap:14px; }

  /* ── Section title ───────────────────────────────────────────────────── */
  .section-title {
    display:flex; justify-content:space-between; align-items:center;
    font-size:.93rem; font-weight:700; margin-bottom:12px;
    padding-bottom:8px; border-bottom:1px solid var(--border-color);
  }
  .badge-count {
    font-size:.72rem; font-weight:600;
    background:var(--primary); color:white;
    border-radius:20px; padding:2px 9px;
  }

  /* ── Items table ─────────────────────────────────────────────────────── */
  .items-table-wrap { max-height:460px; overflow-y:auto; }
  .items-table-wrap table thead th { position:sticky; top:0; background:var(--bg-color); z-index:1; }
  .empty-state {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:40px 20px; color:var(--text-muted); text-align:center; gap:8px; font-size:.88rem;
  }

  /* ── Controls ────────────────────────────────────────────────────────── */
  .qty-mini {
    padding:4px 6px; border:1px solid var(--border-color);
    border-radius:4px; font-size:.85rem; outline:none;
  }
  .qty-mini:focus { border-color:var(--primary); }
  .btn-remove {
    background:none; border:none; cursor:pointer;
    padding:2px; opacity:.45; transition:.15s;
  }
  .btn-remove:hover { opacity:1; transform:scale(1.2); }

  /* ── Code pill ───────────────────────────────────────────────────────── */
  .code-pill {
    display:inline-block; font-size:.7rem; font-weight:600;
    background:rgba(67,94,190,.08); color:var(--primary);
    border-radius:3px; padding:1px 5px; font-family:monospace;
  }

  /* ── Totals ──────────────────────────────────────────────────────────── */
  .totals-box { display:flex; flex-direction:column; gap:8px; }
  .totals-row {
    display:flex; justify-content:space-between;
    align-items:center; font-size:.9rem;
  }
  .totals-row span:first-child { color:var(--text-muted); }
  .totals-row span:last-child  { font-weight:500; }
  .total-final {
    font-size:1.15rem; font-weight:700; color:var(--primary);
    border-top:1px solid var(--border-color); padding-top:10px; margin-top:4px;
  }
  .total-final span:first-child { color:var(--primary); }
  .discount-input {
    width:80px; text-align:right; padding:3px 6px;
    border:1px solid var(--border-color); border-radius:4px;
    font-size:.88rem; outline:none;
  }
  .discount-input:focus { border-color:var(--primary); }

  /* ── Form ────────────────────────────────────────────────────────────── */
  .form-control {
    width:100%; padding:7px 10px;
    border:1px solid var(--border-color); border-radius:var(--radius-sm);
    outline:none; font-size:.88rem; font-family:inherit;
    resize:vertical; box-sizing:border-box;
  }
  .form-control:focus { border-color:var(--primary); }
  label { display:block; font-size:.8rem; font-weight:500; color:var(--text-muted); margin-bottom:4px; }

  /* ── Badges ──────────────────────────────────────────────────────────── */
  .badge { padding:3px 9px; border-radius:4px; font-size:.72rem; font-weight:700; text-transform:uppercase; }
  .badge-success   { background:rgba(40,167,69,.1);   color:var(--success); }
  .badge-primary   { background:rgba(67,94,190,.1);   color:var(--primary); }
  .badge-secondary { background:rgba(108,117,125,.1); color:var(--secondary); }
</style>
