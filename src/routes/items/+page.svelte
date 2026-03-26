<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';

  let viewState = "1";
  let items = [];
  let categories = [];
  let subcategories = [];
  let filterCategory = '';
  
  let showModal = false;
  let isEditing = false;
  
  let currentItem = {
    id: null,
    internal_code: '',
    name: '',
    category_id: '',
    subcategory_id: '',
    description: '',
    item_type: 'cantidad',
    uses_serial: 0,
    total_quantity: 1,
    rental_price: 0,
    status: 'disponible',
    notes: ''
  };

  async function loadData() {
    if (window.api && window.api.db) {
      categories = await window.api.db.get("SELECT * FROM categories ORDER BY name ASC");
      loadItems();
    }
  }

  async function loadItems() {
    let query = `
      SELECT i.*, c.name as cat_name, s.name as subcat_name 
      FROM items i 
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN subcategories s ON i.subcategory_id = s.id
      WHERE i.is_active = ?
    `;
    let params = [parseInt(viewState)];
    if (filterCategory) {
      query += ` AND i.category_id = ?`;
      params.push(filterCategory);
    }
    query += ` ORDER BY i.name ASC`;
    
    items = await window.api.db.get(query, params);
  }

  async function onCategoryChange() {
    if (currentItem.category_id) {
      subcategories = await window.api.db.get("SELECT * FROM subcategories WHERE category_id = ?", [currentItem.category_id]);
    } else {
      subcategories = [];
    }
    currentItem.subcategory_id = '';
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentItem = {
      id: null, internal_code: '', name: '', category_id: '', subcategory_id: '',
      description: '', item_type: 'cantidad', uses_serial: 0, total_quantity: 1, 
      rental_price: 0, status: 'disponible', notes: ''
    };
    subcategories = [];
    showModal = true;
  }

  async function openEdit(item) {
    isEditing = true;
    currentItem = { ...item };
    if (currentItem.category_id) {
      subcategories = await window.api.db.get("SELECT * FROM subcategories WHERE category_id = ?", [currentItem.category_id]);
    }
    showModal = true;
  }

  async function saveItem() {
    if (!currentItem.name || !currentItem.category_id) {
      alert("Nombre y Categoría son obligatorios");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE items SET 
          internal_code=?, name=?, category_id=?, subcategory_id=?, description=?, 
          item_type=?, uses_serial=?, total_quantity=?, available_quantity=?, rental_price=?, notes=?
        WHERE id=?`, 
        [currentItem.internal_code, currentItem.name, currentItem.category_id, currentItem.subcategory_id || null,
         currentItem.description, currentItem.item_type, currentItem.uses_serial, currentItem.total_quantity,
         currentItem.total_quantity, currentItem.rental_price, currentItem.notes, currentItem.id]
      );
    } else {
      await window.api.db.run(`
        INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentItem.internal_code, currentItem.name, currentItem.category_id, currentItem.subcategory_id || null,
         currentItem.description, currentItem.item_type, currentItem.uses_serial, currentItem.total_quantity,
         currentItem.total_quantity, currentItem.rental_price, currentItem.notes]
      );
    }
    showModal = false;
    loadItems();
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este ítem?" 
            : newState === 1 ? "¿Marcar este ítem como Activo?"
            : "¿Marcar este ítem como Inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE items SET is_active = ? WHERE id = ?", [newState, id]);
      loadItems();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Inventario de Ítems</span>
      <select bind:value={viewState} on:change={loadItems} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <div style="display: flex; gap: 10px;">
      <select class="form-control" bind:value={filterCategory} on:change={loadItems} style="width: 200px;">
        <option value="">Todas las Categorías</option>
        {#each categories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
      <button class="btn btn-primary" on:click={openCreate}>+ Nuevo Ítem</button>
    </div>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Nombre</th>
          <th>Categoría</th>
          <th>Tipo</th>
          <th>Stock</th>
          <th>Precio Alquiler</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each items as item}
          <tr>
            <td><span class="badge badge-primary">{item.internal_code || '-'}</span></td>
            <td style="font-weight: 500;">{item.name}</td>
            <td>
              {item.cat_name}
              {#if item.subcat_name}<br><small style="color:var(--text-muted)">{item.subcat_name}</small>{/if}
            </td>
            <td>
              <span class="badge {item.item_type === 'cantidad' ? 'badge-success' : 'badge-warning'}">
                {item.item_type === 'cantidad' ? 'Por Cantidad' : 'Serializado'}
              </span>
            </td>
            <td style="font-weight: bold; color: {item.available_quantity > 0 ? 'var(--success)' : 'var(--danger)'};">
              {item.available_quantity} / {item.total_quantity}
            </td>
            <td>${item.rental_price.toFixed(2)}</td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(item)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(item.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(item.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(item.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(item.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(item.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay ítems registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Ítem' : 'Nuevo Ítem'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="itm-code">Código Interno</label>
        <input id="itm-code" type="text" bind:value={currentItem.internal_code} class="form-control" placeholder="Ej. AUD-001">
      </div>
      <div style="flex: 2;">
        <label for="itm-name">Nombre *</label>
        <input id="itm-name" type="text" bind:value={currentItem.name} class="form-control" placeholder="Ej. Bocina Activa 15&quot;">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="itm-cat">Categoría *</label>
        <select id="itm-cat" class="form-control" bind:value={currentItem.category_id} on:change={onCategoryChange}>
          <option value="">Seleccione...</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="itm-subcat">Subcategoría</label>
        <select id="itm-subcat" class="form-control" bind:value={currentItem.subcategory_id} disabled={!currentItem.category_id}>
          <option value="">Ninguna</option>
          {#each subcategories as sub}
            <option value={sub.id}>{sub.name}</option>
          {/each}
        </select>
      </div>
    </div>

    <div style="display: flex; gap: 15px; align-items: flex-end;">
      <div style="flex: 1;">
        <label for="itm-type">Tipo de Ítem</label>
        <select id="itm-type" class="form-control" bind:value={currentItem.item_type}>
          <option value="cantidad">General (Por Cantidad)</option>
          <option value="serializado">Unitario (Serializado)</option>
        </select>
      </div>
      <div style="flex: 1;">
        <label for="itm-qty">Cantidad Total</label>
        <input id="itm-qty" type="number" bind:value={currentItem.total_quantity} min="1" class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="itm-price">Precio Alquiler</label>
        <input id="itm-price" type="number" step="0.01" bind:value={currentItem.rental_price} class="form-control">
      </div>
    </div>
    
    <div>
      <span style="display:block; font-size:0.85rem; font-weight:500; color:var(--text-muted); margin-bottom:5px;">¿Controla Seriales Individuales?</span>
      <div style="display: flex; gap: 10px; margin-top: 5px;">
        <label style="display: inline-flex; align-items: center; gap: 5px; margin-bottom: 0;">
          <input type="radio" bind:group={currentItem.uses_serial} value={0}> No
        </label>
        <label style="display: inline-flex; align-items: center; gap: 5px; margin-bottom: 0;">
          <input type="radio" bind:group={currentItem.uses_serial} value={1}> Sí
        </label>
      </div>
    </div>

    <div>
      <label for="itm-notes">Descripción / Observaciones</label>
      <textarea id="itm-notes" bind:value={currentItem.notes} class="form-control" rows="2"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveItem}>Guardar Ítem</button>
  </div>
</Modal>

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
</style>
