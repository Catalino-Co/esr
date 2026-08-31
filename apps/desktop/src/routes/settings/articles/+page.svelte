<script>
  /**
   * Catalogo de articulos: QUE existe, como se describe y en que estado de
   * circulacion esta.
   *
   * Separado de Inventario, que responde a otra pregunta —cuanto hay y donde—.
   * Aqui viven el alta, la baja y el archivado; alli no, porque activar o
   * archivar un articulo no es algo que se decida mirando existencias.
   *
   * Gemelo de Configuracion › Articulos en ESR Cloud.
   */
  import { onMount } from 'svelte';
  import {
    isSerializedInventoryItem,
    normalizeSerializedInventoryInput,
    parseSerialLines,
    validateSerialCatalogInput
  } from '@esr/core';
  import { validateInventoryItemInput } from '@esr/schemas';
  import { Modal } from '@esr/ui';
  import { fmt, fmtN } from '@esr/reports';

  let viewState = "1";
  let items = [];
  let categories = [];
  let subcategories = [];
  let suppliers = [];
  let units = [];
  /**
   * El almacen donde escribe esta pantalla mientras no elija almacen.
   *
   * Desde la migracion 0009 las existencias se reparten en `item_stock`, y la
   * pantalla de Inventario por almacen es el paso siguiente.
   */
  let almacenPorDefecto = null;
  let filterCategory = '';
  
  let showModal = false;
  let isEditing = false;
  let serialLines = '';
  
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
      suppliers = await window.api.db.get(
        'SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name ASC'
      );
      units = await window.api.db.get(
        'SELECT id, name, abbr FROM units_of_measure WHERE is_active = 1 ORDER BY name ASC'
      );
      const almacenes = await window.api.db.get(
        "SELECT id FROM warehouses WHERE is_active = 1 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, id LIMIT 1"
      );
      almacenPorDefecto = almacenes?.[0]?.id ?? null;
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
      rental_price: 0, status: 'disponible', notes: '',
      supplier_id: '', uom_id: '', min_stock: 0
    };
    serialLines = '';
    subcategories = [];
    showModal = true;
  }

  async function openEdit(item) {
    isEditing = true;
    currentItem = { ...item };
    const serials = await window.api.db.get(
      'SELECT serial_number FROM item_serials WHERE item_id = ? ORDER BY serial_number ASC',
      [item.id]
    );
    serialLines = serials.map(s => s.serial_number).join('\n');
    if (currentItem.category_id) {
      subcategories = await window.api.db.get("SELECT * FROM subcategories WHERE category_id = ?", [currentItem.category_id]);
    }
    showModal = true;
  }

  async function saveItem() {
    if (!validateInventoryItemInput(currentItem).valid) {
      alert("Nombre y Categoría son obligatorios");
      return;
    }

    const usesSerial = isSerializedInventoryItem(currentItem);
    const serialNumbers = parseSerialLines(serialLines);
    let catalogSerialNumbers = [];

    if (usesSerial) {
      const serialValidation = validateSerialCatalogInput(serialNumbers);
      if (!serialValidation.ok) {
        alert('Agregue al menos un serial para equipos unitarios.');
        return;
      }
      catalogSerialNumbers = serialValidation.value;
      currentItem = normalizeSerializedInventoryInput(currentItem, catalogSerialNumbers);
    } else {
      currentItem = normalizeSerializedInventoryInput(currentItem, []);
    }

    let itemId = currentItem.id;
    if (isEditing) {
      await window.api.db.run(`
        UPDATE items SET 
          internal_code=?, name=?, category_id=?, subcategory_id=?, description=?, 
          item_type=?, uses_serial=?, total_quantity=?, available_quantity=?, rental_price=?, notes=?,
          supplier_id=?, uom_id=?, min_stock=?
        WHERE id=?`,
        [currentItem.internal_code, currentItem.name, currentItem.category_id, currentItem.subcategory_id || null,
         currentItem.description, currentItem.item_type, currentItem.uses_serial, currentItem.total_quantity,
         currentItem.total_quantity, currentItem.rental_price, currentItem.notes,
         currentItem.supplier_id || null, currentItem.uom_id || null,
         Math.max(0, Math.trunc(Number(currentItem.min_stock) || 0)), currentItem.id]
      );
    } else {
      const res = await window.api.db.run(`
        INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, notes, supplier_id, uom_id, min_stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentItem.internal_code, currentItem.name, currentItem.category_id, currentItem.subcategory_id || null,
         currentItem.description, currentItem.item_type, currentItem.uses_serial, currentItem.total_quantity,
         currentItem.total_quantity, currentItem.rental_price, currentItem.notes,
         currentItem.supplier_id || null, currentItem.uom_id || null,
         Math.max(0, Math.trunc(Number(currentItem.min_stock) || 0))]
      );
      itemId = res.id;
    }

    // Las existencias se reparten en `item_stock` desde la migración 0009. En
    // ESR Pro `items.total_quantity` SIGUE siendo el total —esta app guarda los
    // números en vez de calcularlos—, así que se mantienen los dos a la vez: el
    // total y dónde está. Un serializado no lleva fila: su existencia son sus
    // seriales, y una cantidad aquí sería un segundo número contradiciendo al
    // primero.
    if (!usesSerial && almacenPorDefecto) {
      await window.api.db.run(
        `INSERT INTO item_stock (item_id, warehouse_id, quantity) VALUES (?, ?, ?)
         ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity`,
        [itemId, almacenPorDefecto, Math.max(0, Math.trunc(Number(currentItem.total_quantity) || 0))]
      );
    }

    if (usesSerial) {
      await window.api.db.run('DELETE FROM item_serials WHERE item_id = ?', [itemId]);
      for (const serialNumber of catalogSerialNumbers) {
        await window.api.db.run(
          'INSERT INTO item_serials (item_id, serial_number, status) VALUES (?, ?, ?)',
          [itemId, serialNumber, 'disponible']
        );
      }
    } else if (isEditing) {
      await window.api.db.run('DELETE FROM item_serials WHERE item_id = ?', [itemId]);
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
              {fmtN(item.available_quantity)} / {fmtN(item.total_quantity)}
            </td>
            <td>${fmt(item.rental_price)}</td>
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
        <input id="itm-qty" type="number" bind:value={currentItem.total_quantity} min="1" class="form-control"
               disabled={currentItem.item_type === 'serializado' || Number(currentItem.uses_serial) === 1}>
      </div>
      <div style="flex: 1;">
        <label for="itm-price">Precio Alquiler</label>
        <input id="itm-price" type="number" step="0.01" bind:value={currentItem.rental_price} class="form-control">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="itm-supplier">Proveedor</label>
        <select id="itm-supplier" bind:value={currentItem.supplier_id} class="form-control">
          <option value="">(Ninguno)</option>
          {#each suppliers as proveedor (proveedor.id)}
            <option value={proveedor.id}>{proveedor.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="itm-uom">Unidad de Medida</label>
        <select id="itm-uom" bind:value={currentItem.uom_id} class="form-control">
          <option value="">(Ninguna)</option>
          {#each units as unidad (unidad.id)}
            <option value={unidad.id}>{unidad.name}{unidad.abbr ? ` (${unidad.abbr})` : ''}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="itm-min">Mínimo</label>
        <input id="itm-min" type="number" min="0" step="1" bind:value={currentItem.min_stock} class="form-control">
        <span style="display:block; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
          Por debajo de este total sale en «Solo stock bajo».
        </span>
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

    {#if isSerializedInventoryItem(currentItem)}
      <div>
        <label for="itm-serials">Seriales individuales</label>
        <textarea id="itm-serials" bind:value={serialLines} class="form-control" rows="5"
                  placeholder="Un serial por línea. Ej. QSC-K12-001"></textarea>
        <small style="color:var(--text-muted);display:block;margin-top:4px;">
          La cantidad total se calcula por la cantidad de seriales registrados.
        </small>
      </div>
    {/if}

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
