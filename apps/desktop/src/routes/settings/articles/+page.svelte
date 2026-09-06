<script>
  /**
   * Catalogo de articulos: QUE existe, como se describe y en que estado de
   * circulacion esta.
   *
   * Separado de Inventario, que responde a otra pregunta —cuanto hay y donde—.
   * Aqui viven el alta, la baja y el archivado; alli no, porque activar o
   * archivar un articulo no es algo que se decida mirando existencias.
   *
   * El ALTA se queda en un modal simple (el articulo aun no existe: no hay
   * almacenes ni proveedores que gestionar todavia). La EDICION es su propia
   * pagina, `settings/articles/edit?id=`, calcada de `packages/edit` —ahi es
   * donde vive la gestion de almacenes y proveedores, que no cabia comoda en
   * un modal.
   *
   * Gemelo de Configuracion › Articulos en ESR Cloud.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { validateInventoryItemInput } from '@esr/schemas';
  import { BackLink, Modal } from '@esr/ui';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { confirmDialog } from '$lib/stores/confirmDialog.js';
  import { fmt } from '@esr/reports';

  let viewState = "1";
  let items = [];
  let categories = [];
  let filterCategory = '';

  let showModal = false;

  /**
   * La ficha del articulo: QUE ES y CUANTO VALE. Ni cantidad ni minimo ni
   * condicion fisica —eso es inventario y vive en su pantalla—.
   *
   * `total_quantity` y `available_quantity` siguen en la tabla `items` porque en
   * ESR Pro son EL MOTOR de reservas, no un espejo: la disponibilidad se
   * mantiene restandolas al comprometer. Lo que desaparece es su presencia AQUI:
   * esta pantalla no las muestra, no las edita y no las pide al crear.
   */
  let nuevo = {
    internal_code: '',
    name: '',
    category_id: '',
    item_type: 'cantidad',
    rental_price: 0,
    internal_cost: 0,
    notes: ''
  };

  async function loadData() {
    if (window.api && window.api.db) {
      categories = await window.api.db.get("SELECT * FROM categories ORDER BY name ASC");
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
             i.item_type, i.uses_serial, i.rental_price,
             i.internal_cost, i.uom_id, i.notes, i.is_active,
             c.name as cat_name, s.name as subcat_name,
             COALESCE(u.abbr, u.name) as uom_abbr
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN subcategories s ON i.subcategory_id = s.id
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

  onMount(() => {
    loadData();
  });

  function openCreate() {
    nuevo = {
      internal_code: '', name: '', category_id: '',
      item_type: 'cantidad', rental_price: 0, internal_cost: 0, notes: ''
    };
    showModal = true;
  }

  async function crear() {
    if (!validateInventoryItemInput(nuevo).valid) {
      dangerModal.show("Nombre y Categoría son obligatorios");
      return;
    }

    // Nace EN CERO, sin almacen ni proveedor: eso se decide en su propia
    // ficha, que es donde vive esa gestion. El campo de cantidad inicial que
    // habia escribia cien sillas sin dejar rastro de quien ni cuando, y ese
    // rastro es lo que hace auditable un almacen.
    const res = await window.api.db.run(`
      INSERT INTO items (internal_code, name, category_id, item_type, uses_serial, total_quantity, available_quantity, rental_price, internal_cost, notes)
      VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      [nuevo.internal_code, nuevo.name, nuevo.category_id, nuevo.item_type,
       nuevo.rental_price, nuevo.internal_cost, nuevo.notes]
    );
    const itemId = res.id;

    // Su fila de existencias, para que aparezca en Inventario desde el primer
    // dia: un articulo en cero tiene que verse igual que uno lleno.
    await window.api.db.run(
      `INSERT OR IGNORE INTO item_inventory (item_id, min_stock, physical_status)
       VALUES (?, 0, 'disponible')`,
      [itemId]
    );

    showModal = false;
    goto(`/settings/articles/edit?id=${itemId}`);
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este ítem?"
            : newState === 1 ? "¿Marcar este ítem como Activo?"
            : "¿Marcar este ítem como Inactivo?";
    if (await confirmDialog.ask(msg)) {
      await window.api.db.run("UPDATE items SET is_active = ? WHERE id = ?", [newState, id]);
      loadItems();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <!-- No lo tenia, siendo subpantalla de Ajustes: era la unica de las doce
           sin forma de volver. -->
      <BackLink href="/settings" label="Volver a Ajustes" />
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
            <td>${fmt(item.rental_price)}</td>
            <td>
              <a class="btn-icon" href="/settings/articles/edit?id={item.id}" title="Editar">✏️</a>
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

<Modal bind:show={showModal} title="Nuevo Ítem">
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="itm-code">Código Interno</label>
        <input id="itm-code" type="text" bind:value={nuevo.internal_code} class="form-control" placeholder="Ej. AUD-001">
      </div>
      <div style="flex: 2;">
        <label for="itm-name">Nombre *</label>
        <input id="itm-name" type="text" bind:value={nuevo.name} class="form-control" placeholder="Ej. Bocina Activa 15&quot;">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="itm-cat">Categoría *</label>
        <select id="itm-cat" class="form-control" bind:value={nuevo.category_id}>
          <option value="">Seleccione...</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="itm-type">Tipo de Ítem</label>
        <select id="itm-type" class="form-control" bind:value={nuevo.item_type}>
          <option value="cantidad">General (Por Cantidad)</option>
          <option value="serializado">Unitario (Serializado)</option>
        </select>
        <span style="display:block; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
          Subcategoría, proveedor, unidad y seriales se agregan editando, ya con el artículo creado.
        </span>
      </div>
    </div>

    <!--
      Los dos precios VIGENTES. Son valores por defecto: la cotización copia
      el de alquiler en su línea y la entrada de stock copia el de compra en
      el movimiento. Cambiarlos aquí no reescribe ninguna de las dos cosas.

      `step="any"` y no `step="0.01"`: con un paso declarado, un valor que no
      sea múltiplo suyo da `stepMismatch` y el campo se queda mudo.
    -->
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="itm-price">Precio de alquiler</label>
        <input id="itm-price" type="number" step="any" min="0" bind:value={nuevo.rental_price} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="itm-cost">Precio de compra</label>
        <input id="itm-cost" type="number" step="any" min="0" bind:value={nuevo.internal_cost} class="form-control">
        <span style="display:block; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
          Se propone como costo al registrar una entrada.
        </span>
      </div>
    </div>

    <div>
      <label for="itm-notes">Notas</label>
      <textarea id="itm-notes" bind:value={nuevo.notes} class="form-control" rows="2"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={crear}>Crear ítem</button>
  </div>
</Modal>

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s; display: inline-flex; text-decoration: none; }
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
</style>
