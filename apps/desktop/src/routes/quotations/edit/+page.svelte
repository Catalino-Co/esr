<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    addInventoryItemToQuote,
    addPackageToQuote as addPackageLineToQuote,
    calculateQuoteTotals,
    recalculateQuoteItemLine,
    removeQuoteItemLine
  } from '@esr/core';
  import { validateQuoteInput } from '@esr/schemas';
  import { generateQuotationPDF } from '$lib/utils/pdfGenerator';
  import { PdfPreviewModal } from '@esr/ui';
  import { fmt, fmtN } from '$lib/utils/format';

  // ── Estado principal ──────────────────────────────────────────────────────
  let isEditing = false;
  let isSaving  = false;
  let quoteId   = null;

  let currentQuotation = {
    id: null, client_id: '', event_id: null,
    date: new Date().toISOString().split('T')[0],
    validity_days: 15, subtotal: 0, discount: 0, total: 0,
    status: 'borrador', notes: '',
    conditions: '50% para reserva. 50% restante antes del evento.'
  };

  // ── Clientes con buscador ─────────────────────────────────────────────────
  let clients        = [];
  let clientSearch   = '';
  let clientFocused  = false;
  let selectedClient = null;

  $: filteredClients = clientSearch.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  function selectClient(c) {
    selectedClient             = c;
    currentQuotation.client_id = c.id;
    clientSearch               = c.name;
    clientFocused              = false;
    currentQuotation.event_id  = null;
    loadClientEvents(c.id);
  }

  function clearClient() {
    selectedClient             = null;
    currentQuotation.client_id = '';
    clientSearch               = '';
    clientEvents               = [];
    currentQuotation.event_id  = null;
  }

  // ── Eventos del cliente ───────────────────────────────────────────────────
  let clientEvents = [];
  async function loadClientEvents(clientId) {
    clientEvents = await window.api.db.get(
      `SELECT id, name, date FROM events WHERE client_id = ? AND is_active = 1 ORDER BY date DESC`,
      [clientId]
    );
  }

  // ── Catálogo: pestañas ────────────────────────────────────────────────────
  let activeTab    = 'items';  // 'items' | 'packages'
  let itemSearch   = '';
  let pkgSearch    = '';

  let allItems     = [];
  let allPackages  = [];
  let addQty       = {};   // { [item_id]: number }

  $: filteredItems = allItems.filter(item => {
    if (!itemSearch.trim()) return true;
    const q = itemSearch.toLowerCase();
    return item.name.toLowerCase().includes(q)
        || (item.internal_code || '').toLowerCase().includes(q)
        || (item.cat_name      || '').toLowerCase().includes(q);
  });

  $: filteredPkgs = allPackages.filter(p =>
    !pkgSearch.trim() || p.name.toLowerCase().includes(pkgSearch.toLowerCase())
  );

  // ── Items de la cotización ────────────────────────────────────────────────
  // { is_package, id, name, quantity, price, total }
  let quoteItems = [];

  function calculateTotals() {
    const totals = calculateQuoteTotals(quoteItems, currentQuotation.discount);
    currentQuotation.subtotal = totals.subtotal;
    currentQuotation.total    = totals.total;
  }

  function addItemToQuote(item) {
    const qty = parseInt(addQty[item.id]) || 1;
    quoteItems = addInventoryItemToQuote(quoteItems, { ...item, code: item.internal_code }, qty);
    addQty[item.id] = 1;
    addQty = { ...addQty };
    calculateTotals();
  }

  function addPackageToQuote(pkg) {
    quoteItems = addPackageLineToQuote(quoteItems, {
      id: pkg.id,
      name: `📦 ${pkg.name}`,
      price: pkg.suggested_price || 0
    });
    calculateTotals();
  }

  function updateLine(i) {
    quoteItems = recalculateQuoteItemLine(quoteItems, i);
    calculateTotals();
  }

  function removeLine(i) {
    quoteItems = removeQuoteItemLine(quoteItems, i);
    calculateTotals();
  }

  // ── PDF preview ───────────────────────────────────────────────────────────
  let showPdfPreview  = false;
  let pdfPreviewUrl   = '';
  let pdfPreviewFile  = '';

  async function generatePDF() {
    if (!validateQuoteInput(currentQuotation).valid) { alert('Seleccione un cliente primero.'); return; }
    calculateTotals();
    const items  = quoteItems.map(q => ({ name: q.name, quantity: q.quantity, price: q.price, total: q.total }));
    const c      = await window.api.db.getOne("SELECT document_id, phone FROM clients WHERE id=?", [currentQuotation.client_id]);
    const qData  = { ...currentQuotation, client_name: selectedClient?.name || clientSearch,
                      client_document: c?.document_id, client_phone: c?.phone };
    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company     = companyData?.[0] ?? null;
    const { url, filename } = generateQuotationPDF(qData, items, 'preview', company);
    pdfPreviewUrl  = url;
    pdfPreviewFile = filename;
    showPdfPreview = true;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    quoteId   = params.get('id');
    isEditing = !!quoteId;

    if (!window.api?.db) return;

    [clients, allItems, allPackages] = await Promise.all([
      window.api.db.get("SELECT id, name, phone, email FROM clients WHERE is_active = 1 ORDER BY name ASC"),
      window.api.db.get(`
        SELECT i.*, c.name as cat_name, s.name as subcat_name
        FROM items i
        LEFT JOIN categories  c ON i.category_id    = c.id
        LEFT JOIN subcategories s ON i.subcategory_id = s.id
        WHERE i.is_active = 1
        ORDER BY c.name ASC, i.name ASC`),
      window.api.db.get("SELECT id, name, suggested_price, description FROM packages WHERE is_active = 1 ORDER BY name ASC")
    ]);

    allItems.forEach(item => { addQty[item.id] = 1; });

    if (isEditing) {
      const q = await window.api.db.getOne('SELECT * FROM quotations WHERE id = ?', [quoteId]);
      if (q) {
        currentQuotation = { ...q };
        const cl = clients.find(c => c.id === q.client_id);
        if (cl) { selectedClient = cl; clientSearch = cl.name; loadClientEvents(cl.id); }
      }

      const rows = await window.api.db.get(`
        SELECT qi.*, i.name as item_name, i.internal_code, p.name as package_name
        FROM quotation_items qi
        LEFT JOIN items    i ON qi.item_id    = i.id
        LEFT JOIN packages p ON qi.package_id = p.id
        WHERE qi.quotation_id = ?`, [quoteId]);

      quoteItems = rows.map(r => {
        const isPkg = r.package_id != null;
        return {
          is_package: isPkg,
          id:       isPkg ? r.package_id : r.item_id,
          name:     isPkg ? `📦 ${r.package_name}` : r.item_name,
          code:     isPkg ? null : r.internal_code,
          quantity: r.quantity,
          price:    r.price,
          total:    r.quantity * r.price
        };
      });
      calculateTotals();
    }
  });

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function saveQuotation() {
    if (!validateQuoteInput(currentQuotation).valid) { alert('Seleccione un cliente.'); return; }
    isSaving = true;
    calculateTotals();
    try {
      let qId;
      if (isEditing) {
        await window.api.db.run(`
          UPDATE quotations SET
            client_id=?, event_id=?, date=?, validity_days=?,
            subtotal=?, discount=?, total=?, status=?, notes=?, conditions=?
          WHERE id=?`,
          [currentQuotation.client_id, currentQuotation.event_id || null,
           currentQuotation.date, currentQuotation.validity_days,
           currentQuotation.subtotal, currentQuotation.discount, currentQuotation.total,
           currentQuotation.status, currentQuotation.notes, currentQuotation.conditions,
           currentQuotation.id]);
        await window.api.db.run('DELETE FROM quotation_items WHERE quotation_id=?', [currentQuotation.id]);
        qId = currentQuotation.id;
      } else {
        const res = await window.api.db.run(`
          INSERT INTO quotations (client_id, event_id, date, validity_days, subtotal, discount, total, status, notes, conditions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [currentQuotation.client_id, currentQuotation.event_id || null,
           currentQuotation.date, currentQuotation.validity_days,
           currentQuotation.subtotal, currentQuotation.discount, currentQuotation.total,
           currentQuotation.status, currentQuotation.notes, currentQuotation.conditions]);
        qId = res.id;
      }

      for (const qi of quoteItems) {
        if (qi.is_package) {
          await window.api.db.run(
            'INSERT INTO quotation_items (quotation_id, package_id, quantity, price) VALUES (?,?,?,?)',
            [qId, qi.id, qi.quantity, qi.price]);
        } else {
          await window.api.db.run(
            'INSERT INTO quotation_items (quotation_id, item_id, quantity, price) VALUES (?,?,?,?)',
            [qId, qi.id, qi.quantity, qi.price]);
        }
      }
      goto('/quotations');
    } catch (err) {
      alert('Error al guardar la cotización.');
      console.error(err);
    } finally {
      isSaving = false;
    }
  }

  // IDs ya en la cotización para resaltar
  $: addedItemIds = new Set(quoteItems.filter(q => !q.is_package).map(q => q.id));
</script>

<!-- ══════════════════════════════════════════════════════════════ TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    <button class="btn-back" on:click={() => goto('/quotations')}>← Cotizaciones</button>
    <h2 class="page-title">
      {#if isEditing}
        Cotización <span style="color:var(--primary);">#{String(currentQuotation.id ?? '').padStart(5,'0')}</span>
      {:else}
        Nueva Cotización
      {/if}
    </h2>
    {#if isEditing}
      <span class="badge badge-{currentQuotation.status === 'aprobada' ? 'success'
        : currentQuotation.status === 'borrador' ? 'secondary'
        : currentQuotation.status === 'enviada'  ? 'info'
        : 'danger'}">{currentQuotation.status?.toUpperCase()}</span>
    {/if}
  </div>
  <div style="display:flex; gap:10px;">
    {#if isEditing}
      <button class="btn btn-secondary" on:click={generatePDF}>🖨️ Ver PDF</button>
    {/if}
    <button class="btn btn-primary" on:click={saveQuotation} disabled={isSaving}>
      {isSaving ? 'Guardando…' : '💾 Guardar'}
    </button>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════ DATOS GENERALES -->
<div class="card info-card">
  <div class="info-row">

    <!-- Cliente con buscador -->
    <div class="field field-xl">
      <label>Cliente *</label>
      <div class="client-search-wrap">
        <div class="client-input-row">
          <span class="search-icon-sm">👤</span>
          <input type="text"
                 class="client-input"
                 placeholder="Buscar cliente por nombre…"
                 bind:value={clientSearch}
                 on:focus={() => clientFocused = true}
                 on:blur={() => setTimeout(() => clientFocused = false, 180)}
          />
          {#if selectedClient}
            <button class="clear-btn" on:click={clearClient} title="Limpiar">✕</button>
          {/if}
        </div>
        {#if clientFocused && filteredClients.length > 0}
          <div class="client-dropdown">
            {#each filteredClients.slice(0, 8) as c (c.id)}
              <button class="client-option" class:selected={c.id === currentQuotation.client_id}
                      on:mousedown={() => selectClient(c)}>
                <span class="client-option-name">{c.name}</span>
                {#if c.phone}<small class="client-option-meta">{c.phone}</small>{/if}
              </button>
            {/each}
            {#if filteredClients.length > 8}
              <div class="client-more">+{filteredClients.length - 8} más…</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Evento del cliente -->
    <div class="field field-lg">
      <label>Evento vinculado</label>
      <select class="form-control" bind:value={currentQuotation.event_id}
              disabled={!currentQuotation.client_id}>
        <option value={null}>(Ninguno)</option>
        {#each clientEvents as ev}
          <option value={ev.id}>{ev.name} — {ev.date}</option>
        {/each}
      </select>
    </div>

    <!-- Fecha -->
    <div class="field">
      <label>Fecha</label>
      <input type="date" class="form-control" bind:value={currentQuotation.date}>
    </div>

    <!-- Validez -->
    <div class="field field-sm">
      <label>Validez (días)</label>
      <input type="number" class="form-control" min="1" bind:value={currentQuotation.validity_days}>
    </div>

    <!-- Estado -->
    {#if isEditing}
    <div class="field">
      <label>Estado</label>
      <select class="form-control" bind:value={currentQuotation.status}>
        <option value="borrador">Borrador</option>
        <option value="enviada">Enviada</option>
        <option value="aprobada">Aprobada</option>
        <option value="rechazada">Rechazada</option>
        <option value="vencida">Vencida</option>
      </select>
    </div>
    {/if}
  </div>
</div>

<!-- ══════════════════════════════════════════════════════ PANEL PRINCIPAL -->
<div class="main-panel">

  <!-- ─── Catálogo izquierdo ─────────────────────────────────────────────── -->
  <div class="card catalog-card">

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:tab-active={activeTab === 'items'}
              on:click={() => activeTab = 'items'}>🎛️ Ítems individuales</button>
      <button class="tab" class:tab-active={activeTab === 'packages'}
              on:click={() => activeTab = 'packages'}>📦 Paquetes</button>
    </div>

    <!-- TAB: Ítems -->
    {#if activeTab === 'items'}
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" class="search-input" placeholder="Buscar por nombre, código o categoría…"
               bind:value={itemSearch}>
        {#if itemSearch}<button class="clear-btn" on:click={() => itemSearch = ''}>✕</button>{/if}
      </div>

      <div class="catalog-table-wrap">
        <table class="table catalog-tbl">
          <thead>
            <tr>
              <th>Código</th>
              <th>Ítem / Categoría</th>
              <th style="width:60px;text-align:center;">Stock</th>
              <th style="width:80px;text-align:right;">Precio</th>
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
                    <br><small class="item-meta">
                      {item.cat_name}{item.subcat_name ? ` › ${item.subcat_name}` : ''}
                    </small>
                  {/if}
                </td>
                <td style="text-align:center;">
                  <span class:stock-ok={item.available_quantity > 0}
                        class:stock-zero={item.available_quantity === 0}>
                    {fmtN(item.available_quantity)}
                  </span>
                </td>
                <td style="text-align:right;font-size:.85rem;color:var(--text-muted);">
                  ${fmt(item.rental_price)}
                </td>
                <td>
                  <div class="add-ctrl">
                    <input type="number" min="1" class="qty-mini"
                           bind:value={addQty[item.id]}
                           aria-label="Cantidad">
                    <button class="btn-add" class:btn-added={addedItemIds.has(item.id)}
                            on:click={() => addItemToQuote(item)}>
                      {addedItemIds.has(item.id) ? '+' : '+ Add'}
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr><td colspan="5" class="empty-row">
                {itemSearch ? `Sin resultados para "${itemSearch}"` : 'Sin ítems disponibles.'}
              </td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="catalog-footer">{filteredItems.length} ítem(s) mostrado(s)</div>

    <!-- TAB: Paquetes -->
    {:else}
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" class="search-input" placeholder="Buscar paquete…" bind:value={pkgSearch}>
        {#if pkgSearch}<button class="clear-btn" on:click={() => pkgSearch = ''}>✕</button>{/if}
      </div>

      <div class="catalog-table-wrap">
        <table class="table catalog-tbl">
          <thead>
            <tr>
              <th>Paquete</th>
              <th>Descripción</th>
              <th style="width:100px;text-align:right;">Precio</th>
              <th style="width:80px;text-align:center;">Agregar</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredPkgs as pkg (pkg.id)}
              <tr>
                <td style="font-weight:500;">📦 {pkg.name}</td>
                <td style="font-size:.82rem;color:var(--text-muted);">{pkg.description || '—'}</td>
                <td style="text-align:right;font-weight:600;color:var(--success);">${fmt(pkg.suggested_price)}</td>
                <td style="text-align:center;">
                  <button class="btn-add" on:click={() => addPackageToQuote(pkg)}>+ Add</button>
                </td>
              </tr>
            {:else}
              <tr><td colspan="4" class="empty-row">
                {pkgSearch ? `Sin resultados para "${pkgSearch}"` : 'Sin paquetes disponibles.'}
              </td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="catalog-footer">{filteredPkgs.length} paquete(s) mostrado(s)</div>
    {/if}
  </div>

  <!-- ─── Panel derecho: cotización ──────────────────────────────────────── -->
  <div class="right-panel">

    <!-- Items de la cotización -->
    <div class="card" style="margin:0;">
      <div class="section-title">
        <span>Detalle de la Cotización</span>
        <span class="badge-count">{quoteItems.length} línea(s)</span>
      </div>

      {#if quoteItems.length === 0}
        <div class="empty-quote">
          <span style="font-size:2rem;">📋</span>
          <p>Agrega ítems o paquetes desde el catálogo.</p>
        </div>
      {:else}
        <div class="quote-lines">
          <table class="table" style="margin:0;">
            <thead>
              <tr>
                <th>Concepto</th>
                <th style="width:58px;text-align:center;">Cant.</th>
                <th style="width:80px;text-align:right;">Precio</th>
                <th style="width:80px;text-align:right;">Total</th>
                <th style="width:28px;"></th>
              </tr>
            </thead>
            <tbody>
              {#each quoteItems as qi, i}
                <tr>
                  <td>
                    {#if qi.code}<span class="code-pill" style="font-size:.68rem;">{qi.code}</span>{/if}
                    <span class="item-name" style="font-size:.85rem;">{qi.name}</span>
                  </td>
                  <td>
                    <input type="number" min="1" class="qty-mini" style="width:50px;"
                           bind:value={qi.quantity} on:input={() => updateLine(i)}
                           aria-label="Cantidad">
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" class="qty-mini"
                           style="width:72px;text-align:right;"
                           bind:value={qi.price} on:input={() => updateLine(i)}
                           aria-label="Precio">
                  </td>
                  <td style="text-align:right;font-weight:600;white-space:nowrap;">
                    ${fmt(qi.total)}
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

      <!-- Totales -->
      <div class="totals-box">
        <div class="totals-row">
          <span>Subtotal</span>
          <span>${fmt(currentQuotation.subtotal)}</span>
        </div>
        <div class="totals-row">
          <span>Descuento</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="color:var(--text-muted);">$</span>
            <input type="number" min="0" step="0.01" class="discount-input"
                   bind:value={currentQuotation.discount}
                   on:input={calculateTotals}
                   aria-label="Descuento">
          </div>
        </div>
        <div class="totals-row total-final">
          <span>TOTAL</span>
          <span>${fmt(currentQuotation.total)}</span>
        </div>
      </div>
    </div>

    <!-- Notas y condiciones -->
    <div class="card" style="margin:0;">
      <div class="section-title">Notas y Condiciones</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label>Observaciones internas</label>
          <textarea class="form-control" rows="2" bind:value={currentQuotation.notes}
                    placeholder="Notas visibles solo internamente…"></textarea>
        </div>
        <div>
          <label>Condiciones (aparecen en el PDF)</label>
          <textarea class="form-control" rows="3" bind:value={currentQuotation.conditions}></textarea>
        </div>
      </div>
    </div>
  </div>
</div>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFile} title="Vista Previa de Cotización" />

<style>
  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .top-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .top-bar-left { display: flex; align-items: center; gap: 12px; }
  .btn-back {
    background: none; border: 1px solid var(--border-color);
    border-radius: var(--radius-sm); padding: 6px 12px;
    cursor: pointer; font-size: .88rem; color: var(--text-muted); transition: .2s;
  }
  .btn-back:hover { background: var(--bg-color); color: var(--text-main); }
  .page-title { margin: 0; font-size: 1.25rem; font-weight: 700; }

  /* ── Info card ───────────────────────────────────────────────────────── */
  .info-card { padding: 14px 18px; }
  .info-row  { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field     { display: flex; flex-direction: column; min-width: 120px; }
  .field-sm  { max-width: 110px; }
  .field-lg  { flex: 1.5; min-width: 180px; }
  .field-xl  { flex: 2; min-width: 240px; }

  /* ── Client combobox ─────────────────────────────────────────────────── */
  .client-search-wrap { position: relative; }
  .client-input-row {
    display: flex; align-items: center; gap: 6px;
    border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    padding: 6px 10px; background: white; transition: .15s;
  }
  .client-input-row:focus-within { border-color: var(--primary); }
  .search-icon-sm { opacity: .45; font-size: .9rem; flex-shrink: 0; }
  .client-input {
    flex: 1; border: none; outline: none;
    font-size: .9rem; background: transparent; min-width: 0;
  }
  .client-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: white; border: 1px solid var(--border-color);
    border-radius: var(--radius-sm); box-shadow: 0 4px 16px rgba(0,0,0,.1);
    z-index: 100; max-height: 240px; overflow-y: auto;
  }
  .client-option {
    width: 100%; background: none; border: none; cursor: pointer;
    padding: 8px 12px; text-align: left; display: flex;
    justify-content: space-between; align-items: center;
    transition: background .1s;
  }
  .client-option:hover  { background: var(--bg-color); }
  .client-option.selected { background: rgba(67,94,190,.07); }
  .client-option-name { font-weight: 500; font-size: .88rem; }
  .client-option-meta { color: var(--text-muted); font-size: .78rem; }
  .client-more { padding: 6px 12px; font-size: .78rem; color: var(--text-muted); }
  .clear-btn {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); font-size: .8rem; padding: 0 2px;
    flex-shrink: 0;
  }
  .clear-btn:hover { color: var(--danger); }

  /* ── Main panel ──────────────────────────────────────────────────────── */
  .main-panel {
    display: grid;
    grid-template-columns: minmax(240px, 0.75fr) minmax(460px, 1fr);
    gap: 16px;
    align-items: start;
  }
  .catalog-card { margin: 0; padding: 0; overflow: hidden; }
  .right-panel  { display: flex; flex-direction: column; gap: 14px; }

  /* ── Tabs ────────────────────────────────────────────────────────────── */
  .tabs { display: flex; border-bottom: 1px solid var(--border-color); }
  .tab {
    padding: 12px 18px; background: none; border: none; cursor: pointer;
    font-size: .88rem; font-weight: 500; color: var(--text-muted);
    border-bottom: 2px solid transparent; margin-bottom: -1px; transition: .15s;
  }
  .tab-active { color: var(--primary); border-bottom-color: var(--primary); }
  .tab:hover:not(.tab-active) { color: var(--text-main); }

  /* ── Search bar ──────────────────────────────────────────────────────── */
  .search-bar {
    display: flex; align-items: center; gap: 8px;
    margin: 12px 14px 8px;
    border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    padding: 6px 10px; background: var(--bg-color);
  }
  .search-input { flex:1; border:none; outline:none; background:transparent; font-size:.9rem; }

  /* ── Catalog table ───────────────────────────────────────────────────── */
  .catalog-table-wrap {
    max-height: 360px; overflow-y: auto;
    border-top: 1px solid var(--border-color);
  }
  .catalog-tbl  { margin: 0; }
  .catalog-tbl thead th { position: sticky; top: 0; background: var(--bg-color); z-index:1; }
  .row-added    { background: rgba(67,94,190,.04); }
  .catalog-footer {
    font-size: .75rem; color: var(--text-muted);
    padding: 6px 14px; text-align: right;
    border-top: 1px solid var(--border-color);
  }
  .empty-row { text-align:center; color:var(--text-muted); padding:24px !important; }

  /* ── Add control ─────────────────────────────────────────────────────── */
  .add-ctrl { display:flex; align-items:center; gap:4px; justify-content:center; }
  .qty-mini {
    width: 42px; text-align:center;
    padding: 3px 4px; border: 1px solid var(--border-color);
    border-radius: 4px; font-size:.82rem; outline:none;
  }
  .btn-add {
    background: var(--primary); color: white; border: none;
    border-radius: 4px; padding: 4px 8px; font-size: .76rem;
    font-weight: 600; cursor: pointer; white-space: nowrap; transition: .15s;
  }
  .btn-add:hover { filter: brightness(1.1); }
  .btn-added { background: #6366f1; }

  /* ── Stock ───────────────────────────────────────────────────────────── */
  .stock-ok   { color: var(--success); font-weight: 600; }
  .stock-zero { color: var(--danger);  font-weight: 600; }

  /* ── Text helpers ────────────────────────────────────────────────────── */
  .item-name { font-weight: 500; font-size: .87rem; }
  .item-meta { color: var(--text-muted); font-size: .76rem; }
  .code-pill {
    display: inline-block; font-size: .7rem; font-weight: 600;
    background: rgba(67,94,190,.08); color: var(--primary);
    border-radius: 3px; padding: 1px 5px; font-family: monospace; margin-right: 4px;
  }

  /* ── Section title ───────────────────────────────────────────────────── */
  .section-title {
    display: flex; justify-content: space-between; align-items: center;
    font-size: .93rem; font-weight: 700; margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border-color);
  }
  .badge-count {
    font-size: .72rem; font-weight: 600;
    background: var(--primary); color: white;
    border-radius: 20px; padding: 2px 9px;
  }

  /* ── Quote lines ─────────────────────────────────────────────────────── */
  .quote-lines { max-height: 380px; overflow-y: auto; margin-bottom: 10px; }
  .empty-quote {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 30px 20px;
    color: var(--text-muted); text-align: center; gap: 6px; font-size: .85rem;
  }
  .btn-remove {
    background: none; border: none; cursor: pointer;
    padding: 2px; opacity: .45; transition: .15s;
  }
  .btn-remove:hover { opacity: 1; transform: scale(1.2); }

  /* ── Totals ──────────────────────────────────────────────────────────── */
  .totals-box {
    border-top: 1px solid var(--border-color);
    padding-top: 10px; margin-top: 4px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .totals-row {
    display: flex; justify-content: space-between;
    align-items: center; font-size: .88rem;
  }
  .totals-row span:first-child { color: var(--text-muted); }
  .totals-row span:last-child  { font-weight: 500; }
  .total-final {
    font-size: 1.2rem; font-weight: 700; color: var(--primary);
    border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 4px;
  }
  .total-final span:first-child { color: var(--primary); }
  .discount-input {
    width: 80px; text-align: right; padding: 3px 6px;
    border: 1px solid var(--border-color); border-radius: 4px;
    font-size: .88rem; outline: none;
  }
  .discount-input:focus { border-color: var(--primary); }

  /* ── Form controls ───────────────────────────────────────────────────── */
  .form-control {
    width: 100%; padding: 7px 10px;
    border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    outline: none; font-size: .88rem; font-family: inherit;
    resize: vertical; box-sizing: border-box;
  }
  .form-control:focus { border-color: var(--primary); }
  label {
    display: block; font-size: .8rem; font-weight: 500;
    color: var(--text-muted); margin-bottom: 4px;
  }

  /* ── Badges ──────────────────────────────────────────────────────────── */
  .badge { padding:3px 9px; border-radius:4px; font-size:.72rem; font-weight:700; text-transform:uppercase; }
  .badge-success   { background:rgba(40,167,69,.1);   color:var(--success); }
  .badge-secondary { background:rgba(108,117,125,.1); color:var(--secondary); }
  .badge-info      { background:rgba(23,162,184,.1);  color:var(--info); }
  .badge-danger    { background:rgba(220,53,69,.1);   color:var(--danger); }
</style>
