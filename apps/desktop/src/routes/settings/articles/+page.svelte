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
  import { fmt } from '@esr/reports';

  let viewState = "1";
  let items = [];
  let categories = [];
  let subcategories = [];
  let suppliers = [];
  let units = [];
  let filterCategory = '';
  
  let showModal = false;
  let isEditing = false;
  let serialLines = '';
  
  /**
   * La ficha del articulo: QUE ES y CUANTO VALE. Ni cantidad ni minimo ni
   * condicion fisica —eso es inventario y vive en su pantalla—.
   *
   * `total_quantity` y `available_quantity` siguen en la tabla `items` porque en
   * ESR Pro son EL MOTOR de reservas, no un espejo: la disponibilidad se
   * mantiene restandolas al comprometer. Lo que desaparece es su presencia AQUI:
   * esta pantalla no las muestra, no las edita y no las pide al crear.
   */
  let currentItem = {
    id: null,
    internal_code: '',
    name: '',
    category_id: '',
    subcategory_id: '',
    description: '',
    item_type: 'cantidad',
    uses_serial: 0,
    rental_price: 0,
    internal_cost: 0,
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
      loadItems();
    }
  }

  async function loadItems() {
    // Columnas del CATALOGO, enumeradas en vez de `i.*`. `min_stock`, `status` y
    // `location` ya no existen —la 0011 las borro—, pero `total_quantity` y
    // `available_quantity` SI siguen ahi, porque en ESR Pro son el motor de
    // reservas. Traerlas aqui las pondria a un `bind:value` de distancia de
    // escribirse sin querer desde una pantalla que no debe tocarlas.
    let query = `
      SELECT i.id, i.internal_code, i.name, i.category_id, i.subcategory_id,
             i.description, i.item_type, i.uses_serial, i.rental_price,
             i.internal_cost, i.supplier_id, i.uom_id, i.notes, i.is_active,
             c.name as cat_name, s.name as subcat_name,
             p.name as supplier_name, COALESCE(u.abbr, u.name) as uom_abbr
      FROM items i 
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN subcategories s ON i.subcategory_id = s.id
      LEFT JOIN suppliers p ON p.id = i.supplier_id
      LEFT JOIN units_of_measure u ON u.id = i.uom_id
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
      description: '', item_type: 'cantidad', uses_serial: 0,
      rental_price: 0, internal_cost: 0, notes: '',
      supplier_id: '', uom_id: ''
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

    // En un SERIALIZADO la existencia SI se deriva aqui, porque registrar sus
    // seriales es definir sus unidades: darlas de alta es catalogo, no almacen.
    // En uno de cantidad, esta pantalla no toca ni `total_quantity` ni
    // `available_quantity`: el stock entra por un movimiento de Inventario.
    let itemId = currentItem.id;
    if (isEditing) {
      const columnas = usesSerial
        ? `internal_code=?, name=?, category_id=?, subcategory_id=?, description=?,
           item_type=?, uses_serial=?, rental_price=?, internal_cost=?, notes=?,
           supplier_id=?, uom_id=?, total_quantity=?, available_quantity=?`
        : `internal_code=?, name=?, category_id=?, subcategory_id=?, description=?,
           item_type=?, uses_serial=?, rental_price=?, internal_cost=?, notes=?,
           supplier_id=?, uom_id=?`;
      const valores = [
        currentItem.internal_code, currentItem.name, currentItem.category_id,
        currentItem.subcategory_id || null, currentItem.description,
        currentItem.item_type, currentItem.uses_serial,
        currentItem.rental_price, currentItem.internal_cost, currentItem.notes,
        currentItem.supplier_id || null, currentItem.uom_id || null
      ];
      if (usesSerial) valores.push(catalogSerialNumbers.length, catalogSerialNumbers.length);
      valores.push(currentItem.id);

      await window.api.db.run(`UPDATE items SET ${columnas} WHERE id=?`, valores);
    } else {
      // Nace EN CERO. El campo de cantidad inicial que habia escribia cien
      // sillas sin dejar rastro de quien ni cuando, y ese rastro es lo que hace
      // auditable un almacen.
      const inicial = usesSerial ? catalogSerialNumbers.length : 0;
      const res = await window.api.db.run(`
        INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, internal_cost, notes, supplier_id, uom_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentItem.internal_code, currentItem.name, currentItem.category_id, currentItem.subcategory_id || null,
         currentItem.description, currentItem.item_type, currentItem.uses_serial, inicial, inicial,
         currentItem.rental_price, currentItem.internal_cost, currentItem.notes,
         currentItem.supplier_id || null, currentItem.uom_id || null]
      );
      itemId = res.id;

      // Su fila de existencias, para que aparezca en Inventario desde el primer
      // dia: un articulo en cero tiene que verse igual que uno lleno.
      await window.api.db.run(
        `INSERT OR IGNORE INTO item_inventory (item_id, min_stock, physical_status)
         VALUES (?, 0, 'disponible')`,
        [itemId]
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
      <span>Catálogo de artículos</span>
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
          <th>Unidad</th>
          <th>Proveedor</th>
          <th>Precio alquiler</th>
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
            <!-- Ni existencias ni disponible: esta pantalla es el CATÁLOGO.
                 Cuánto hay se ve en Inventario, y repetirlo aquí acabaría
                 enseñando dos números distintos para lo mismo. -->
            <td>{item.uom_abbr || '-'}</td>
            <td>{item.supplier_name || '-'}</td>
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
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay ítems registrados.</td>
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

    <div style="display: flex; gap: 15px; align-items: flex-start;">
      <div style="flex: 1;">
        <label for="itm-type">Tipo de Ítem</label>
        <select id="itm-type" class="form-control" bind:value={currentItem.item_type}>
          <option value="cantidad">General (Por Cantidad)</option>
          <option value="serializado">Unitario (Serializado)</option>
        </select>
      </div>
      <!--
        Los dos precios VIGENTES. Son valores por defecto: la cotización copia
        el de alquiler en su línea y la entrada de stock copia el de compra en
        el movimiento. Cambiarlos aquí no reescribe ninguna de las dos cosas.

        `step="any"` y no `step="0.01"`: con un paso declarado, un valor que no
        sea múltiplo suyo da `stepMismatch` y el campo se queda mudo.
      -->
      <div style="flex: 1;">
        <label for="itm-price">Precio de alquiler</label>
        <input id="itm-price" type="number" step="any" min="0" bind:value={currentItem.rental_price} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="itm-cost">Precio de compra</label>
        <input id="itm-cost" type="number" step="any" min="0" bind:value={currentItem.internal_cost} class="form-control">
        <span style="display:block; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
          Se propone como costo al registrar una entrada.
        </span>
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
          Registrar un serial es DEFINIR una unidad, no moverla de sitio: por eso
          se hace aquí. La cantidad total sale de cuántos haya registrados.
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
