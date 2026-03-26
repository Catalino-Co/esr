<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { generateWorkOrderPDF, generateConducePDF } from '$lib/utils/pdfGenerator';
  import PdfPreviewModal from '$lib/components/PdfPreviewModal.svelte';
  import { fmtN } from '$lib/utils/format';

  // ── Estado principal ──────────────────────────────────────────────────────
  let isEditing = false;
  let isSaving  = false;
  let woId      = null;

  let currentWO = {
    id: null, client_id: '', event_id: null, quotation_id: null,
    date: new Date().toISOString().split('T')[0],
    responsible_person: '', vehicle: '', notes: '', status: 'pendiente'
  };

  // ── Cotizaciones (importar) ───────────────────────────────────────────────
  let quotations    = [];
  let quoteSearch   = '';
  let quoteFocused  = false;
  let selectedQuote = null;
  let importing     = false;

  $: filteredQuotes = quotations.filter(q => {
    if (!quoteSearch.trim()) return true;
    const s = quoteSearch.toLowerCase();
    return String(q.id).padStart(5,'0').includes(s)
        || (q.client_name || '').toLowerCase().includes(s);
  });

  function selectQuote(q) {
    selectedQuote          = q;
    quoteSearch            = `#${String(q.id).padStart(5,'0')} — ${q.client_name}`;
    quoteFocused           = false;
    currentWO.quotation_id = q.id;
  }

  function clearQuote() {
    selectedQuote          = null;
    quoteSearch            = '';
    currentWO.quotation_id = null;
  }

  async function importFromQuotation() {
    if (!currentWO.quotation_id) return;
    importing = true;
    try {
      const quote = await window.api.db.getOne(
        'SELECT client_id, event_id, date FROM quotations WHERE id = ?',
        [currentWO.quotation_id]
      );
      if (quote) {
        currentWO.date     = quote.date;
        currentWO.event_id = quote.event_id || null;
        const cl = clients.find(c => c.id === quote.client_id);
        if (cl) selectClient(cl);
      }

      const qItems = await window.api.db.get(
        'SELECT item_id, package_id, quantity FROM quotation_items WHERE quotation_id = ?',
        [currentWO.quotation_id]
      );
      woItems = [];
      for (const qi of qItems) {
        if (qi.package_id) {
          const pkgItems = await window.api.db.get(`
            SELECT pi.item_id, pi.quantity, i.name, i.internal_code
            FROM package_items pi JOIN items i ON pi.item_id = i.id
            WHERE pi.package_id = ?`, [qi.package_id]);
          for (const pi of pkgItems) mergeItem(pi.item_id, pi.name, pi.internal_code, pi.quantity * qi.quantity);
        } else if (qi.item_id) {
          const iDef = await window.api.db.getOne('SELECT name, internal_code FROM items WHERE id = ?', [qi.item_id]);
          if (iDef) mergeItem(qi.item_id, iDef.name, iDef.internal_code, qi.quantity);
        }
      }
    } finally {
      importing = false;
    }
  }

  // ── Clientes ──────────────────────────────────────────────────────────────
  let clients        = [];
  let clientSearch   = '';
  let clientFocused  = false;
  let selectedClient = null;

  $: filteredClients = clientSearch.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  function selectClient(c) {
    selectedClient      = c;
    currentWO.client_id = c.id;
    clientSearch        = c.name;
    clientFocused       = false;
    currentWO.event_id  = null;
    loadClientEvents(c.id);
  }

  function clearClient() {
    selectedClient      = null;
    currentWO.client_id = '';
    clientSearch        = '';
    clientEvents        = [];
    currentWO.event_id  = null;
  }

  // ── Eventos del cliente ───────────────────────────────────────────────────
  let clientEvents = [];
  async function loadClientEvents(clientId) {
    clientEvents = await window.api.db.get(
      'SELECT id, name, date FROM events WHERE client_id = ? AND is_active = 1 ORDER BY date DESC',
      [clientId]
    );
  }

  // ── Catálogo de ítems ─────────────────────────────────────────────────────
  let allItems   = [];
  let itemSearch = '';
  let addQty     = {};

  $: filteredItems = allItems.filter(item => {
    if (!itemSearch.trim()) return true;
    const q = itemSearch.toLowerCase();
    return item.name.toLowerCase().includes(q)
        || (item.internal_code || '').toLowerCase().includes(q)
        || (item.cat_name      || '').toLowerCase().includes(q);
  });

  // ── Equipos de la orden ───────────────────────────────────────────────────
  let woItems = [];

  function mergeItem(id, name, code, qty) {
    const ex = woItems.find(w => w.item_id === id);
    if (ex) { ex.quantity += qty; } else { woItems.push({ item_id: id, name, internal_code: code, quantity: qty }); }
    woItems = [...woItems];
  }

  function addItemToWO(item) {
    const qty = parseInt(addQty[item.id]) || 1;
    mergeItem(item.id, item.name, item.internal_code, qty);
    addQty[item.id] = 1;
    addQty = { ...addQty };
  }

  function removeItem(i) {
    woItems.splice(i, 1);
    woItems = [...woItems];
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  let showPdfPreview  = false;
  let pdfPreviewUrl   = '';
  let pdfPreviewFile  = '';
  let pdfPreviewTitle = '';

  async function openPDF(type) {
    const items   = woItems.map(w => ({ ...w, price: 0 }));
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const woData  = { ...currentWO, client_name: selectedClient?.name || clientSearch };
    if (type === 'wo') {
      const { url, filename } = generateWorkOrderPDF(woData, items, 'preview', company);
      pdfPreviewUrl   = url;
      pdfPreviewFile  = filename;
      pdfPreviewTitle = `Orden de Trabajo WO-${String(currentWO.id).padStart(5,'0')}`;
    } else {
      const { url, filename } = generateConducePDF(woData, items, 'preview', company);
      pdfPreviewUrl   = url;
      pdfPreviewFile  = filename;
      pdfPreviewTitle = `Conduce WO-${String(currentWO.id).padStart(5,'0')}`;
    }
    showPdfPreview = true;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    woId      = params.get('id');
    isEditing = !!woId;

    if (!window.api?.db) return;

    [clients, allItems, quotations] = await Promise.all([
      window.api.db.get('SELECT id, name, phone FROM clients WHERE is_active = 1 ORDER BY name ASC'),
      window.api.db.get(`
        SELECT i.id, i.name, i.internal_code, i.available_quantity,
               c.name as cat_name, s.name as subcat_name
        FROM items i
        LEFT JOIN categories    c ON i.category_id    = c.id
        LEFT JOIN subcategories s ON i.subcategory_id = s.id
        WHERE i.is_active = 1
        ORDER BY c.name ASC, i.name ASC`),
      window.api.db.get(`
        SELECT q.id, q.total, c.name as client_name
        FROM quotations q LEFT JOIN clients c ON q.client_id = c.id
        WHERE q.status = 'aprobada' AND q.is_active = 1
        ORDER BY q.id DESC`)
    ]);

    allItems.forEach(item => { addQty[item.id] = 1; });

    if (isEditing) {
      const wo = await window.api.db.getOne('SELECT * FROM work_orders WHERE id = ?', [woId]);
      if (wo) {
        currentWO = { ...wo };
        const cl = clients.find(c => c.id === wo.client_id);
        if (cl) { selectedClient = cl; clientSearch = cl.name; loadClientEvents(cl.id); }
        if (wo.quotation_id) {
          const q = quotations.find(q => q.id === wo.quotation_id);
          if (q) { selectedQuote = q; quoteSearch = `#${String(q.id).padStart(5,'0')} — ${q.client_name}`; }
        }
      }
      const rows = await window.api.db.get(`
        SELECT wi.item_id, wi.quantity, i.name, i.internal_code
        FROM work_order_items wi JOIN items i ON wi.item_id = i.id
        WHERE wi.work_order_id = ?`, [woId]);
      woItems = rows.map(r => ({ item_id: r.item_id, name: r.name, internal_code: r.internal_code, quantity: r.quantity }));
    }
  });

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function saveWO() {
    if (!currentWO.client_id) { alert('Seleccione un cliente.'); return; }
    isSaving = true;
    try {
      let id;
      if (isEditing) {
        await window.api.db.run(`
          UPDATE work_orders SET
            client_id=?, event_id=?, quotation_id=?, date=?,
            responsible_person=?, vehicle=?, notes=?, status=?
          WHERE id=?`,
          [currentWO.client_id, currentWO.event_id || null, currentWO.quotation_id || null,
           currentWO.date, currentWO.responsible_person, currentWO.vehicle,
           currentWO.notes, currentWO.status, currentWO.id]);
        await window.api.db.run('DELETE FROM work_order_items WHERE work_order_id=?', [currentWO.id]);
        id = currentWO.id;
      } else {
        const res = await window.api.db.run(`
          INSERT INTO work_orders
            (client_id, event_id, quotation_id, date, responsible_person, vehicle, notes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [currentWO.client_id, currentWO.event_id || null, currentWO.quotation_id || null,
           currentWO.date, currentWO.responsible_person, currentWO.vehicle,
           currentWO.notes, currentWO.status]);
        id = res.id;
      }
      for (const wi of woItems) {
        await window.api.db.run(
          'INSERT INTO work_order_items (work_order_id, item_id, quantity) VALUES (?, ?, ?)',
          [id, wi.item_id, wi.quantity]);
      }
      goto('/work_orders');
    } catch (err) {
      alert('Error al guardar la orden de trabajo.');
      console.error(err);
    } finally {
      isSaving = false;
    }
  }

  $: addedItemIds = new Set(woItems.map(w => w.item_id));
</script>

<!-- ══════════════════════════════════════════════════════════════ TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    <button class="btn-back" on:click={() => goto('/work_orders')}>← Órdenes de Trabajo</button>
    <h2 class="page-title">
      {#if isEditing}
        Orden de Trabajo <span style="color:var(--primary);">WO-{String(currentWO.id ?? '').padStart(5,'0')}</span>
      {:else}
        Nueva Orden de Trabajo
      {/if}
    </h2>
    {#if isEditing}
      <span class="badge badge-{currentWO.status === 'cerrado' || currentWO.status === 'entregado' ? 'success'
        : currentWO.status === 'pendiente' ? 'secondary'
        : currentWO.status === 'preparado' || currentWO.status === 'cargado' ? 'info'
        : 'primary'}">{currentWO.status?.toUpperCase()}</span>
    {/if}
  </div>
  <div style="display:flex;gap:10px;">
    {#if isEditing}
      <button class="btn btn-secondary" on:click={() => openPDF('wo')} title="Imprimir Orden de Trabajo">🖨️ WO</button>
      <button class="btn btn-secondary" on:click={() => openPDF('conduce')} title="Generar Conduce">📝 Conduce</button>
    {/if}
    <button class="btn btn-primary" on:click={saveWO} disabled={isSaving}>
      {isSaving ? 'Guardando…' : '💾 Guardar'}
    </button>
  </div>
</div>

<!-- ══════════════════════════════════════════════════ DATOS GENERALES -->
<div class="card info-card">

  <!-- Importar desde cotización -->
  <div class="import-box">
    <div class="import-box-label">🔗 Generar desde Cotización Aprobada <span style="font-weight:400;color:var(--text-muted);">(opcional)</span></div>
    <div class="import-row">
      <div class="quote-search-wrap">
        <div class="combo-input-row" class:combo-has-value={!!selectedQuote}>
          <span class="combo-icon">📄</span>
          <input type="text" class="combo-input"
                 placeholder="Buscar por Nº o nombre de cliente…"
                 bind:value={quoteSearch}
                 on:focus={() => quoteFocused = true}
                 on:blur={() => setTimeout(() => quoteFocused = false, 180)} />
          {#if selectedQuote}
            <button class="clear-btn" on:click={clearQuote} title="Limpiar">✕</button>
          {/if}
        </div>
        {#if quoteFocused && filteredQuotes.length > 0}
          <div class="combo-dropdown">
            {#each filteredQuotes.slice(0, 10) as q (q.id)}
              <button class="combo-option" class:selected={q.id === currentWO.quotation_id}
                      on:mousedown={() => selectQuote(q)}>
                <span class="combo-option-main">
                  <span class="code-pill">#{String(q.id).padStart(5,'0')}</span>
                  {q.client_name || '—'}
                </span>
                <span class="combo-option-sub">${q.total?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) ?? '0.00'}</span>
              </button>
            {/each}
            {#if filteredQuotes.length > 10}
              <div class="combo-more">+{filteredQuotes.length - 10} más…</div>
            {/if}
          </div>
        {/if}
      </div>
      <button class="btn btn-primary" on:click={importFromQuotation}
              disabled={!currentWO.quotation_id || importing}>
        {importing ? 'Importando…' : '⬇ Importar Datos'}
      </button>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Campos principales -->
  <div class="info-row">

    <!-- Cliente -->
    <div class="field field-xl">
      <label>Cliente *</label>
      <div class="quote-search-wrap">
        <div class="combo-input-row" class:combo-has-value={!!selectedClient}>
          <span class="combo-icon">👤</span>
          <input type="text" class="combo-input"
                 placeholder="Buscar cliente por nombre…"
                 bind:value={clientSearch}
                 on:focus={() => clientFocused = true}
                 on:blur={() => setTimeout(() => clientFocused = false, 180)} />
          {#if selectedClient}
            <button class="clear-btn" on:click={clearClient} title="Limpiar">✕</button>
          {/if}
        </div>
        {#if clientFocused && filteredClients.length > 0}
          <div class="combo-dropdown">
            {#each filteredClients.slice(0, 8) as c (c.id)}
              <button class="combo-option" class:selected={c.id === currentWO.client_id}
                      on:mousedown={() => selectClient(c)}>
                <span class="combo-option-main">{c.name}</span>
                {#if c.phone}<span class="combo-option-sub">{c.phone}</span>{/if}
              </button>
            {/each}
            {#if filteredClients.length > 8}
              <div class="combo-more">+{filteredClients.length - 8} más…</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Evento -->
    <div class="field field-lg">
      <label>Evento vinculado</label>
      <select class="form-control" bind:value={currentWO.event_id}
              disabled={!currentWO.client_id}>
        <option value={null}>(Ninguno)</option>
        {#each clientEvents as ev}
          <option value={ev.id}>{ev.name} — {ev.date}</option>
        {/each}
      </select>
    </div>

    <!-- Fecha -->
    <div class="field">
      <label>Fecha de Operación</label>
      <input type="date" class="form-control" bind:value={currentWO.date}>
    </div>

    <!-- Estado (solo edición) -->
    {#if isEditing}
    <div class="field">
      <label>Estado</label>
      <select class="form-control" bind:value={currentWO.status}>
        <option value="pendiente">Pendiente</option>
        <option value="preparado">Preparado</option>
        <option value="cargado">Cargado</option>
        <option value="entregado">Entregado</option>
        <option value="en recogida">En Recogida</option>
        <option value="retornado">Retornado</option>
        <option value="cerrado">Cerrado</option>
      </select>
    </div>
    {/if}
  </div>

  <!-- Segunda fila: responsable y vehículo -->
  <div class="info-row" style="margin-top:12px;">
    <div class="field field-lg">
      <label>Responsable / Chofer</label>
      <input type="text" class="form-control" placeholder="Nombre del responsable…"
             bind:value={currentWO.responsible_person}>
    </div>
    <div class="field field-lg">
      <label>Vehículo asignado</label>
      <input type="text" class="form-control" placeholder="Placa o descripción del vehículo…"
             bind:value={currentWO.vehicle}>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════ PANEL PRINCIPAL -->
<div class="main-panel">

  <!-- ─── Catálogo de ítems ──────────────────────────────────────────────── -->
  <div class="card catalog-card">
    <div class="catalog-header">
      <span class="catalog-title">📦 Inventario Disponible</span>
      <span class="catalog-count">{filteredItems.length} ítems</span>
    </div>

    <div class="search-bar">
      <span>🔍</span>
      <input type="text" class="search-input"
             placeholder="Buscar por nombre, código o categoría…"
             bind:value={itemSearch}>
      {#if itemSearch}
        <button class="clear-btn" on:click={() => itemSearch = ''}>✕</button>
      {/if}
    </div>

    <div class="catalog-table-wrap">
      <table class="table catalog-tbl">
        <thead>
          <tr>
            <th style="width:90px;">Código</th>
            <th>Ítem / Categoría</th>
            <th style="width:55px;text-align:center;">Stock</th>
            <th style="width:110px;text-align:center;">Agregar</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredItems as item (item.id)}
            <tr class:row-added={addedItemIds.has(item.id)}>
              <td><span class="code-pill">{item.internal_code || '—'}</span></td>
              <td>
                <span class="item-name">{item.name}</span>
                {#if item.cat_name}
                  <br><small class="item-meta">{item.cat_name}{item.subcat_name ? ` › ${item.subcat_name}` : ''}</small>
                {/if}
              </td>
              <td style="text-align:center;">
                <span class:stock-ok={item.available_quantity > 0}
                      class:stock-zero={item.available_quantity === 0}>
                  {fmtN(item.available_quantity)}
                </span>
              </td>
              <td>
                <div class="add-ctrl">
                  <input type="number" min="1" class="qty-mini"
                         bind:value={addQty[item.id]} aria-label="Cantidad">
                  <button class="btn-add" class:btn-added={addedItemIds.has(item.id)}
                          on:click={() => addItemToWO(item)}>
                    {addedItemIds.has(item.id) ? '+' : '+ Add'}
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="4" class="empty-row">
              {itemSearch ? `Sin resultados para "${itemSearch}"` : 'Sin ítems disponibles.'}
            </td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="catalog-footer">{filteredItems.length} ítem(s) mostrado(s)</div>
  </div>

  <!-- ─── Panel derecho: equipos + notas ─────────────────────────────────── -->
  <div class="right-panel">

    <!-- Equipos asignados -->
    <div class="card" style="margin:0;">
      <div class="section-title">
        <span>🔧 Equipos a Preparar</span>
        <span class="badge-count">{woItems.length} ítem(s)</span>
      </div>

      {#if woItems.length === 0}
        <div class="empty-wo">
          <span style="font-size:2rem;">📦</span>
          <p>Agrega equipos desde el catálogo.</p>
        </div>
      {:else}
        <div class="wo-lines">
          <table class="table" style="margin:0;">
            <thead>
              <tr>
                <th style="width:80px;">Código</th>
                <th>Equipo</th>
                <th style="width:72px;text-align:center;">Cant.</th>
                <th style="width:28px;"></th>
              </tr>
            </thead>
            <tbody>
              {#each woItems as wi, i}
                <tr>
                  <td><span class="code-pill" style="font-size:.68rem;">{wi.internal_code || '—'}</span></td>
                  <td><span class="item-name" style="font-size:.87rem;">{wi.name}</span></td>
                  <td>
                    <input type="number" min="1" class="qty-mini"
                           style="width:56px;text-align:center;"
                           bind:value={wi.quantity}
                           on:input={() => woItems = [...woItems]}
                           aria-label="Cantidad">
                  </td>
                  <td>
                    <button class="btn-remove" on:click={() => removeItem(i)} title="Quitar">🗑️</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Notas / Instrucciones -->
    <div class="card" style="margin:0;">
      <div class="section-title">📝 Instrucciones de Montaje / Observaciones</div>
      <textarea class="form-control" rows="5"
                placeholder="Instrucciones de montaje, observaciones especiales, indicaciones al equipo de logística…"
                bind:value={currentWO.notes}></textarea>
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
  .field     { display:flex; flex-direction:column; min-width:120px; }
  .field-lg  { flex:1.5; min-width:180px; }
  .field-xl  { flex:2; min-width:240px; }
  .divider   { border:none; border-top:1px solid var(--border-color); margin:14px 0; }

  /* ── Import box ──────────────────────────────────────────────────────── */
  .import-box {
    background:rgba(67,94,190,.04); border:1px dashed rgba(67,94,190,.35);
    border-radius:var(--radius-sm); padding:12px 14px;
  }
  .import-box-label { font-size:.82rem; font-weight:600; color:var(--primary); margin-bottom:8px; }
  .import-row { display:flex; gap:10px; align-items:center; }
  .quote-search-wrap { flex:1; position:relative; }

  /* ── Shared combobox ─────────────────────────────────────────────────── */
  .combo-input-row {
    display:flex; align-items:center; gap:6px;
    border:1px solid var(--border-color); border-radius:var(--radius-sm);
    padding:6px 10px; background:white; transition:.15s;
  }
  .combo-input-row:focus-within { border-color:var(--primary); }
  .combo-has-value { border-color:var(--primary); background:rgba(67,94,190,.03); }
  .combo-icon  { opacity:.45; font-size:.9rem; flex-shrink:0; }
  .combo-input { flex:1; border:none; outline:none; font-size:.9rem; background:transparent; min-width:0; }
  .combo-dropdown {
    position:absolute; top:calc(100% + 4px); left:0; right:0;
    background:white; border:1px solid var(--border-color);
    border-radius:var(--radius-sm); box-shadow:0 4px 18px rgba(0,0,0,.1);
    z-index:200; max-height:260px; overflow-y:auto;
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
    grid-template-columns:minmax(280px,1fr) minmax(380px,480px);
    gap:16px; align-items:start;
  }
  .catalog-card { margin:0; padding:0; overflow:hidden; }
  .right-panel  { display:flex; flex-direction:column; gap:14px; }

  /* ── Catalog header ──────────────────────────────────────────────────── */
  .catalog-header {
    display:flex; justify-content:space-between; align-items:center;
    padding:12px 14px 0; font-size:.88rem;
  }
  .catalog-title { font-weight:700; }
  .catalog-count { font-size:.75rem; color:var(--text-muted); }

  /* ── Search bar ──────────────────────────────────────────────────────── */
  .search-bar {
    display:flex; align-items:center; gap:8px;
    margin:10px 14px 8px;
    border:1px solid var(--border-color); border-radius:var(--radius-sm);
    padding:6px 10px; background:var(--bg-color);
  }
  .search-input { flex:1; border:none; outline:none; background:transparent; font-size:.9rem; }

  /* ── Catalog table ───────────────────────────────────────────────────── */
  .catalog-table-wrap {
    max-height:400px; overflow-y:auto;
    border-top:1px solid var(--border-color);
  }
  .catalog-tbl { margin:0; }
  .catalog-tbl thead th { position:sticky; top:0; background:var(--bg-color); z-index:1; }
  .row-added { background:rgba(67,94,190,.04); }
  .catalog-footer {
    font-size:.75rem; color:var(--text-muted);
    padding:6px 14px; text-align:right;
    border-top:1px solid var(--border-color);
  }
  .empty-row { text-align:center; color:var(--text-muted); padding:24px !important; }

  /* ── Add control ─────────────────────────────────────────────────────── */
  .add-ctrl { display:flex; align-items:center; gap:4px; justify-content:center; }
  .qty-mini {
    width:42px; text-align:center;
    padding:3px 4px; border:1px solid var(--border-color);
    border-radius:4px; font-size:.82rem; outline:none;
  }
  .btn-add {
    background:var(--primary); color:white; border:none;
    border-radius:4px; padding:4px 8px; font-size:.76rem;
    font-weight:600; cursor:pointer; white-space:nowrap; transition:.15s;
  }
  .btn-add:hover { filter:brightness(1.1); }
  .btn-added { background:#6366f1; }

  /* ── Stock ───────────────────────────────────────────────────────────── */
  .stock-ok   { color:var(--success); font-weight:600; }
  .stock-zero { color:var(--danger);  font-weight:600; }

  /* ── Text helpers ────────────────────────────────────────────────────── */
  .item-name { font-weight:500; font-size:.87rem; }
  .item-meta { color:var(--text-muted); font-size:.76rem; }
  .code-pill {
    display:inline-block; font-size:.7rem; font-weight:600;
    background:rgba(67,94,190,.08); color:var(--primary);
    border-radius:3px; padding:1px 5px; font-family:monospace;
  }

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

  /* ── WO lines ────────────────────────────────────────────────────────── */
  .wo-lines { max-height:380px; overflow-y:auto; margin-bottom:6px; }
  .empty-wo {
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; padding:28px 20px;
    color:var(--text-muted); text-align:center; gap:6px; font-size:.85rem;
  }
  .btn-remove {
    background:none; border:none; cursor:pointer;
    padding:2px; opacity:.45; transition:.15s;
  }
  .btn-remove:hover { opacity:1; transform:scale(1.2); }

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
  .badge-secondary { background:rgba(108,117,125,.1); color:var(--secondary); }
  .badge-info      { background:rgba(23,162,184,.1);  color:var(--info); }
  .badge-primary   { background:rgba(67,94,190,.1);   color:var(--primary); }
</style>
