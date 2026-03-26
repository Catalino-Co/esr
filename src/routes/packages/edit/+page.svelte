<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fmt, fmtN } from '$lib/utils/format';

  // ── Estado del paquete ────────────────────────────────────────────────────
  let isEditing   = false;
  let isSaving    = false;
  let packageId   = null;

  let currentPackage = { id: null, name: '', description: '', suggested_price: 0, notes: '' };

  // ── Ítems disponibles ─────────────────────────────────────────────────────
  let allItems    = [];
  let searchQuery = '';
  let addQty      = {};   // { [item_id]: number }

  $: filteredItems = allItems.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.internal_code  || '').toLowerCase().includes(q) ||
      (item.cat_name       || '').toLowerCase().includes(q) ||
      (item.subcat_name    || '').toLowerCase().includes(q)
    );
  });

  // ── Contenido del paquete ─────────────────────────────────────────────────
  let packageItems = [];   // { item_id, item_name, internal_code, cat_name, quantity }

  // Computed: ids ya agregados para resaltarlos en la tabla
  $: addedIds = new Set(packageItems.map(p => p.item_id));

  // Mapa reactivo: item_id → cantidad asignada al paquete
  $: pkgQtyMap = Object.fromEntries(packageItems.map(pi => [pi.item_id, pi.quantity]));

  // Devuelve true si la cantidad asignada >= stock disponible del ítem
  function isOverStock(item) {
    return (pkgQtyMap[item.id] || 0) >= item.available_quantity;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    packageId     = params.get('id');
    isEditing     = !!packageId;

    if (!window.api?.db) return;

    allItems = await window.api.db.get(`
      SELECT i.id, i.internal_code, i.name, i.total_quantity, i.available_quantity,
             i.rental_price, i.item_type,
             c.name as cat_name, s.name as subcat_name
      FROM items i
      LEFT JOIN categories  c ON i.category_id    = c.id
      LEFT JOIN subcategories s ON i.subcategory_id = s.id
      WHERE i.is_active = 1
      ORDER BY c.name ASC, i.name ASC
    `);

    allItems.forEach(item => { addQty[item.id] = 1; });

    if (isEditing) {
      const pkg = await window.api.db.getOne('SELECT * FROM packages WHERE id = ?', [packageId]);
      if (pkg) currentPackage = { ...pkg };

      const rows = await window.api.db.get(`
        SELECT pi.item_id, pi.quantity,
               i.name as item_name, i.internal_code,
               c.name as cat_name
        FROM package_items pi
        JOIN items i ON pi.item_id = i.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE pi.package_id = ?
      `, [packageId]);

      packageItems = rows;
    }
  });

  // ── Agregar ítem al paquete ───────────────────────────────────────────────
  function addItem(item) {
    const qty = parseInt(addQty[item.id]) || 1;
    const existing = packageItems.find(p => p.item_id === item.id);
    if (existing) {
      existing.quantity += qty;
      packageItems = [...packageItems];
    } else {
      packageItems = [...packageItems, {
        item_id:       item.id,
        item_name:     item.name,
        internal_code: item.internal_code,
        cat_name:      item.cat_name,
        quantity:      qty
      }];
    }
    addQty[item.id] = 1;
    addQty = { ...addQty };
  }

  function removeItem(itemId) {
    packageItems = packageItems.filter(p => p.item_id !== itemId);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function savePackage() {
    if (!currentPackage.name.trim()) {
      alert('El nombre del paquete es obligatorio.');
      return;
    }
    isSaving = true;
    try {
      let pkgId;
      if (isEditing) {
        await window.api.db.run(
          `UPDATE packages SET name=?, description=?, suggested_price=?, notes=? WHERE id=?`,
          [currentPackage.name.trim(), currentPackage.description, currentPackage.suggested_price,
           currentPackage.notes, currentPackage.id]
        );
        await window.api.db.run(`DELETE FROM package_items WHERE package_id=?`, [currentPackage.id]);
        pkgId = currentPackage.id;
      } else {
        const res = await window.api.db.run(
          `INSERT INTO packages (name, description, suggested_price, notes) VALUES (?, ?, ?, ?)`,
          [currentPackage.name.trim(), currentPackage.description,
           currentPackage.suggested_price, currentPackage.notes]
        );
        pkgId = res.id;
      }

      for (const pi of packageItems) {
        await window.api.db.run(
          `INSERT INTO package_items (package_id, item_id, quantity) VALUES (?, ?, ?)`,
          [pkgId, pi.item_id, pi.quantity]
        );
      }

      goto('/packages');
    } catch (err) {
      alert('Error al guardar el paquete. Revisa la consola.');
      console.error(err);
    } finally {
      isSaving = false;
    }
  }

  // Precio sugerido calculado desde los items (solo referencia)
  $: suggestedTotal = packageItems.reduce((acc, pi) => {
    const item = allItems.find(i => i.id === pi.item_id);
    return acc + (item ? item.rental_price * pi.quantity : 0);
  }, 0);
</script>

<!-- ═══════════════════════════════════════════════════════════════ HEADER -->
<div class="page-header">
  <div class="header-left">
    <button class="btn-back" on:click={() => goto('/packages')} title="Volver">
      ← Paquetes
    </button>
    <h2 class="page-title">
      {isEditing ? `Editar: ${currentPackage.name || '…'}` : 'Nuevo Paquete'}
    </h2>
  </div>
  <button class="btn btn-primary" on:click={savePackage} disabled={isSaving}>
    {isSaving ? 'Guardando…' : '💾 Guardar Paquete'}
  </button>
</div>

<!-- ═══════════════════════════════════════════════════════════ INFO GENERAL -->
<div class="card">
  <div class="section-title">Información General</div>
  <div class="info-grid">
    <div class="field field-wide">
      <label for="pkg-name">Nombre del Paquete *</label>
      <input id="pkg-name" type="text" class="form-control"
             bind:value={currentPackage.name}
             placeholder="Ej. Paquete Boda Estándar">
    </div>
    <div class="field field-wide">
      <label for="pkg-desc">Descripción Breve</label>
      <input id="pkg-desc" type="text" class="form-control"
             bind:value={currentPackage.description}
             placeholder="Descripción corta del paquete…">
    </div>
    <div class="field">
      <label for="pkg-price">Precio Sugerido ($)</label>
      <input id="pkg-price" type="number" step="0.01" min="0" class="form-control"
             bind:value={currentPackage.suggested_price}>
      {#if suggestedTotal > 0}
        <span class="price-hint">
          Suma de ítems: <strong>${fmt(suggestedTotal)}</strong>
        </span>
      {/if}
    </div>
    <div class="field field-wide">
      <label for="pkg-notes">Observaciones Internas</label>
      <textarea id="pkg-notes" class="form-control" rows="2"
                bind:value={currentPackage.notes}
                placeholder="Notas solo visibles internamente…"></textarea>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ PANEL DOBLE -->
<div class="two-panel">

  <!-- ─── Panel izquierdo: catálogo de ítems ─────────────────────────────── -->
  <div class="card panel-left">
    <div class="section-title">Catálogo de Ítems</div>

    <!-- Búsqueda -->
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input type="text" class="search-input" placeholder="Buscar por nombre, código o categoría…"
             bind:value={searchQuery}>
      {#if searchQuery}
        <button class="clear-btn" on:click={() => searchQuery = ''}>✕</button>
      {/if}
    </div>

    <div class="catalog-table-wrapper">
      <table class="table catalog-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Ítem / Categoría</th>
            <th style="width: 70px; text-align: center;">Stock</th>
            <th style="width: 70px; text-align: right;">Precio</th>
            <th style="width: 110px; text-align: center;">Agregar</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredItems as item (item.id)}
            <tr class:row-added={addedIds.has(item.id)}>
              <td>
                <span class="code-badge">{item.internal_code || '—'}</span>
              </td>
              <td>
                <span class="item-name">{item.name}</span>
                {#if item.cat_name}
                  <br><small class="item-meta">{item.cat_name}{item.subcat_name ? ` › ${item.subcat_name}` : ''}</small>
                {/if}
              </td>
              <td style="text-align: center;">
                <span class="stock" class:stock-ok={item.available_quantity > 0}
                                    class:stock-zero={item.available_quantity === 0}>
                  {fmtN(item.available_quantity)}
                </span>
              </td>
              <td style="text-align: right; font-size: 0.85rem; color: var(--text-muted);">
                ${fmt(item.rental_price)}
              </td>
              <td>
                <div class="add-control">
                  <input type="number" min="1" class="qty-input"
                         bind:value={addQty[item.id]}
                         aria-label="Cantidad a agregar">
                  <button class="btn-add"
                          class:btn-add-over={isOverStock(item)}
                          on:click={() => addItem(item)}
                          title={isOverStock(item)
                            ? `⚠️ Ya tienes ${pkgQtyMap[item.id]} asignado(s) y el stock disponible es ${item.available_quantity}`
                            : addedIds.has(item.id) ? 'Agregar más unidades' : 'Agregar al paquete'}>
                    {addedIds.has(item.id) ? '+' : '+ Add'}
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" style="text-align:center; color: var(--text-muted); padding: 30px;">
                {#if searchQuery}
                  No hay ítems que coincidan con "<strong>{searchQuery}</strong>".
                {:else}
                  No hay ítems disponibles en el inventario.
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="catalog-footer">
      {filteredItems.length} ítem{filteredItems.length !== 1 ? 's' : ''} mostrado{filteredItems.length !== 1 ? 's' : ''}
      {#if searchQuery} · filtrando por "{searchQuery}"{/if}
    </div>
  </div>

  <!-- ─── Panel derecho: contenido del paquete ────────────────────────────── -->
  <div class="card panel-right">
    <div class="section-title" style="display:flex; justify-content: space-between; align-items: center;">
      <span>Contenido del Paquete</span>
      <span class="badge-count">{packageItems.length} ítem{packageItems.length !== 1 ? 's' : ''}</span>
    </div>

    {#if packageItems.length === 0}
      <div class="empty-state">
        <span style="font-size: 2rem;">📦</span>
        <p>El paquete está vacío.<br>Busca y agrega ítems desde el catálogo.</p>
      </div>
    {:else}
      <div class="pkg-items-list">
        {#each packageItems as pi (pi.item_id)}
          <div class="pkg-item-row">
            <div class="pkg-item-info">
              <span class="code-badge">{pi.internal_code || '—'}</span>
              <div>
                <div class="item-name">{pi.item_name}</div>
                {#if pi.cat_name}<small class="item-meta">{pi.cat_name}</small>{/if}
              </div>
            </div>
            <div class="pkg-item-controls">
              <button class="qty-btn" on:click={() => { if(pi.quantity > 1) { pi.quantity--; packageItems = [...packageItems]; } }}>−</button>
              <input type="number" min="1" class="qty-input-sm"
                     bind:value={pi.quantity}
                     on:change={() => packageItems = [...packageItems]}
                     aria-label="Cantidad">
              <button class="qty-btn" on:click={() => { pi.quantity++; packageItems = [...packageItems]; }}>+</button>
              <button class="btn-remove" on:click={() => removeItem(pi.item_id)} title="Quitar del paquete">🗑️</button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Totalizador -->
      <div class="pkg-total">
        <span class="pkg-total-label">Precio referencial</span>
        <span class="pkg-total-value">${fmt(suggestedTotal)}</span>
      </div>
    {/if}
  </div>

</div>

<style>
  /* ── Layout ─────────────────────────────────────────────────────────────── */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .btn-back {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-muted);
    transition: 0.2s;
  }
  .btn-back:hover { background: var(--bg-color); color: var(--text-main); }
  .page-title {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text-main);
  }

  /* ── Info grid ───────────────────────────────────────────────────────────── */
  .info-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }
  .field { display: flex; flex-direction: column; min-width: 160px; }
  .field-wide { flex: 2; min-width: 220px; }

  .price-hint {
    margin-top: 4px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  /* ── Two panel ───────────────────────────────────────────────────────────── */
  .two-panel {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 16px;
    align-items: start;
  }
  .panel-left, .panel-right { margin: 0; }

  /* ── Section titles ──────────────────────────────────────────────────────── */
  .section-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }

  /* ── Search bar ──────────────────────────────────────────────────────────── */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    margin-bottom: 10px;
  }
  .search-icon { font-size: 0.9rem; opacity: 0.5; }
  .search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.9rem;
    color: var(--text-main);
  }
  .clear-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 0 2px;
  }
  .clear-btn:hover { color: var(--danger); }

  /* ── Catalog table ───────────────────────────────────────────────────────── */
  .catalog-table-wrapper {
    max-height: 460px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }
  .catalog-table { margin: 0; }
  .catalog-table thead th {
    position: sticky;
    top: 0;
    background: var(--bg-color);
    z-index: 1;
  }
  .row-added { background: rgba(67, 94, 190, 0.04); }
  .catalog-footer {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-top: 6px;
    text-align: right;
  }

  /* ── Add control (inside table) ──────────────────────────────────────────── */
  .add-control {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: center;
  }
  .qty-input {
    width: 44px;
    text-align: center;
    padding: 3px 4px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.85rem;
    outline: none;
  }
  .btn-add {
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: 0.2s;
  }
  .btn-add:hover { filter: brightness(1.1); }
  .btn-add.btn-add-over {
    background: #f59e0b;
    color: #fff;
  }
  .btn-add.btn-add-over:hover { background: #d97706; }

  /* ── Stock badge ─────────────────────────────────────────────────────────── */
  .stock { font-weight: 600; font-size: 0.85rem; }
  .stock-ok   { color: var(--success); }
  .stock-zero { color: var(--danger); }

  /* ── Item text ───────────────────────────────────────────────────────────── */
  .item-name { font-weight: 500; font-size: 0.88rem; }
  .item-meta { color: var(--text-muted); font-size: 0.78rem; }
  .code-badge {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 600;
    background: rgba(67,94,190,0.08);
    color: var(--primary);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: monospace;
  }

  /* ── Package items list ──────────────────────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: var(--text-muted);
    text-align: center;
    gap: 8px;
    font-size: 0.88rem;
  }
  .pkg-items-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 420px;
    overflow-y: auto;
  }
  .pkg-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    border-left: 3px solid var(--primary);
  }
  .pkg-item-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }
  .pkg-item-info > div { min-width: 0; }
  .pkg-item-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .qty-btn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border-color);
    background: var(--surface-color, #fff);
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.15s;
  }
  .qty-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
  .qty-input-sm {
    width: 40px;
    text-align: center;
    padding: 3px 2px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
    outline: none;
  }
  .btn-remove {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    opacity: 0.5;
    transition: 0.2s;
    margin-left: 4px;
  }
  .btn-remove:hover { opacity: 1; transform: scale(1.15); }

  /* ── Totalizador ─────────────────────────────────────────────────────────── */
  .pkg-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--border-color);
  }
  .pkg-total-label { font-size: 0.85rem; color: var(--text-muted); }
  .pkg-total-value { font-size: 1.2rem; font-weight: 700; color: var(--primary); }

  .badge-count {
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--primary);
    color: white;
    border-radius: 20px;
    padding: 2px 10px;
  }

  /* ── Form controls ───────────────────────────────────────────────────────── */
  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    outline: none;
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
  }
  .form-control:focus { border-color: var(--primary); }
  label {
    display: block;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
</style>
