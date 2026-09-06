<script>
  /**
   * Ficha de UN artículo: qué es, en qué almacenes vive y quién lo suministra.
   *
   * Antes esto era un modal que solo tenía la mitad —el catálogo, sin
   * almacenes ni proveedores—; esa gestión vivía medio escondida en el modal
   * "Existencias por almacén" de Inventario. Se junta todo aquí, calcado del
   * layout de dos columnas que ya usa la ficha de Cliente en Cloud (izquierda
   * los almacenes, derecha el formulario y sus proveedores), y de `packages/edit`
   * para la convención de ruta: `?id=` en la query, alta y edición separadas.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Icon } from '@esr/ui';
  import {
    formatNumber,
    isSerializedInventoryItem,
    normalizeSerializedInventoryInput,
    parseSerialLines,
    recordStateBadgeClass,
    recordStateLabel,
    validateSerialCatalogInput
  } from '@esr/core';
  import { validateInventoryItemInput } from '@esr/schemas';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { confirmDialog } from '$lib/stores/confirmDialog.js';

  let itemId = null;
  let cargando = true;
  let guardando = false;
  let recargando = false;

  let currentItem = { id: null, name: '', is_active: 1 };
  let categories = [];
  let subcategories = [];
  let suppliers = [];
  let units = [];
  let almacenes = [];

  let serialLines = '';
  /** A que almacen entran los seriales NUEVOS que se agreguen ahora. */
  let serialWarehouseId = '';
  let serials = [];

  let distribution = [];
  let itemSuppliers = [];

  const usuario = () => JSON.parse(sessionStorage.getItem('esr_user') || 'null');

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    itemId = params.get('id');
    if (!itemId) {
      goto('/settings/articles');
      return;
    }
    if (!window.api?.db) return;
    await cargarTodo();
    cargando = false;
  });

  async function cargarTodo() {
    categories = await window.api.db.get('SELECT * FROM categories ORDER BY name ASC');
    suppliers = await window.api.db.get(
      'SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name ASC'
    );
    units = await window.api.db.get(
      'SELECT id, name, abbr FROM units_of_measure WHERE is_active = 1 ORDER BY name ASC'
    );
    almacenes = await window.api.db.get(
      "SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, name"
    );
    serialWarehouseId = almacenes[0] ? String(almacenes[0].id) : '';

    const item = await window.api.db.getOne('SELECT * FROM items WHERE id = ?', [itemId]);
    if (!item) {
      goto('/settings/articles');
      return;
    }
    currentItem = { ...item };

    if (currentItem.category_id) {
      subcategories = await window.api.db.get(
        'SELECT * FROM subcategories WHERE category_id = ?',
        [currentItem.category_id]
      );
    }

    await cargarSeriales();
    await cargarDistribucion();
    await cargarProveedores();
  }

  async function recargar() {
    recargando = true;
    try {
      await cargarTodo();
    } finally {
      recargando = false;
    }
  }

  async function onCategoryChange() {
    if (currentItem.category_id) {
      subcategories = await window.api.db.get(
        'SELECT * FROM subcategories WHERE category_id = ?',
        [currentItem.category_id]
      );
    } else {
      subcategories = [];
    }
    currentItem.subcategory_id = '';
  }

  async function cargarSeriales() {
    if (!isSerializedInventoryItem(currentItem)) {
      serials = [];
      serialLines = '';
      return;
    }
    serials = await window.api.db.get(
      `SELECT s.id, s.serial_number, s.status, s.warehouse_id, w.name AS warehouse_name
         FROM item_serials s
         LEFT JOIN warehouses w ON w.id = s.warehouse_id
        WHERE s.item_id = ?
        ORDER BY s.serial_number ASC`,
      [itemId]
    );
    serialLines = serials.map((s) => s.serial_number).join('\n');
  }

  /**
   * Donde esta repartido el articulo: una fila por almacen activo, las de
   * cero incluidas. Misma consulta que ya usa Inventario para lo mismo.
   */
  async function cargarDistribucion() {
    distribution = await window.api.db.get(
      `SELECT w.id AS warehouse_id, w.name AS warehouse_name,
              CASE WHEN i.item_type = 'serializado' THEN (
                     SELECT COUNT(*) FROM item_serials s
                      WHERE s.item_id = i.id AND s.warehouse_id = w.id
                        AND s.status NOT IN ('retirado', 'mantenimiento'))
                   ELSE COALESCE((SELECT st.quantity FROM item_stock st
                                   WHERE st.item_id = i.id AND st.warehouse_id = w.id), 0)
              END AS quantity
         FROM warehouses w
         CROSS JOIN items i
        WHERE w.is_active = 1 AND i.id = ?
        ORDER BY CASE WHEN w.code = 'PRIN' THEN 0 ELSE 1 END, w.name`,
      [itemId]
    );
  }

  async function cargarProveedores() {
    itemSuppliers = await window.api.db.get(
      `SELECT its.supplier_id, s.name AS supplier_name, its.is_primary
         FROM item_suppliers its
         INNER JOIN suppliers s ON s.id = its.supplier_id
        WHERE its.item_id = ?
        ORDER BY its.is_primary DESC, s.name`,
      [itemId]
    );
  }

  // ── Guardar la ficha ──────────────────────────────────────────────────────
  async function guardar() {
    if (!validateInventoryItemInput(currentItem).valid) {
      dangerModal.show('Nombre y Categoría son obligatorios');
      return;
    }

    const usesSerial = isSerializedInventoryItem(currentItem);
    const serialNumbers = parseSerialLines(serialLines);
    let catalogSerialNumbers = [];

    if (usesSerial) {
      const serialValidation = validateSerialCatalogInput(serialNumbers);
      if (!serialValidation.ok) {
        dangerModal.show('Agregue al menos un serial para equipos unitarios.');
        return;
      }
      catalogSerialNumbers = serialValidation.value;
      currentItem = normalizeSerializedInventoryInput(currentItem, catalogSerialNumbers);
    } else {
      currentItem = normalizeSerializedInventoryInput(currentItem, []);
    }

    guardando = true;
    try {
      // Sin `supplier_id`: quedó superado por la tabla de proveedores múltiples
      // de abajo. NO se toca ninguna existencia aquí: eso es Almacenes, más
      // abajo, que además deja constancia en la bitácora.
      const columnas = usesSerial
        ? `internal_code=?, name=?, category_id=?, subcategory_id=?,
           item_type=?, uses_serial=?, rental_price=?, internal_cost=?, notes=?,
           uom_id=?, is_active=?, total_quantity=?, available_quantity=?`
        : `internal_code=?, name=?, category_id=?, subcategory_id=?,
           item_type=?, uses_serial=?, rental_price=?, internal_cost=?, notes=?,
           uom_id=?, is_active=?`;
      const valores = [
        currentItem.internal_code, currentItem.name, currentItem.category_id,
        currentItem.subcategory_id || null,
        currentItem.item_type, currentItem.uses_serial,
        currentItem.rental_price, currentItem.internal_cost, currentItem.notes,
        currentItem.uom_id || null, currentItem.is_active
      ];
      if (usesSerial) valores.push(catalogSerialNumbers.length, catalogSerialNumbers.length);
      valores.push(itemId);

      await window.api.db.run(`UPDATE items SET ${columnas} WHERE id=?`, valores);

      if (usesSerial) {
        /*
         * Se RECONCILIA en vez de borrar y volver a crear: lo que ya existe no
         * se toca (conserva almacén y estado), el almacén elegido es solo para
         * las unidades que nacen aquí.
         */
        const existentes = await window.api.db.get(
          'SELECT id, serial_number, status FROM item_serials WHERE item_id = ?',
          [itemId]
        );
        const clave = (valor) => String(valor ?? '').trim().toUpperCase();
        const pedidos = new Set(catalogSerialNumbers.map(clave));
        const yaEstaban = new Set(existentes.map((fila) => clave(fila.serial_number)));

        const bloqueada = existentes.find(
          (fila) => !pedidos.has(clave(fila.serial_number)) && fila.status && fila.status !== 'disponible'
        );
        if (bloqueada) {
          dangerModal.show(`No se puede quitar el serial ${bloqueada.serial_number}: está ${bloqueada.status}.`);
          guardando = false;
          return;
        }

        for (const fila of existentes) {
          if (pedidos.has(clave(fila.serial_number))) continue;
          await window.api.db.run('DELETE FROM item_serials WHERE id = ?', [fila.id]);
        }

        const nuevos = catalogSerialNumbers.filter((sn) => !yaEstaban.has(clave(sn)));
        for (const serialNumber of nuevos) {
          await window.api.db.run(
            'INSERT INTO item_serials (item_id, serial_number, status, warehouse_id) VALUES (?, ?, ?, ?)',
            [itemId, serialNumber, 'disponible', serialWarehouseId || null]
          );
        }

        if (nuevos.length && serialWarehouseId) {
          await window.api.db.run(
            `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
             VALUES (?, ?, ?, 'entrada', ?, ?)`,
            [itemId, serialWarehouseId, usuario()?.id ?? null, nuevos.length,
             `Alta de ${nuevos.length} unidad(es): ${nuevos.join(', ')}`]
          );
        }
      } else {
        await window.api.db.run('DELETE FROM item_serials WHERE item_id = ?', [itemId]);
      }

      await cargarTodo();
    } finally {
      guardando = false;
    }
  }

  // ── Almacenes ─────────────────────────────────────────────────────────────
  let trasladando = null;
  let trasladarDestino = '';
  let trasladarCantidad = 1;

  /**
   * `/items` no lee la URL: recuerda el almacén elegido solo en `localStorage`.
   * Se deja la intención en `sessionStorage`, de un solo uso, para que la
   * próxima carga de `/items` filtre por este almacén y este artículo.
   */
  function verEnInventario(warehouseId) {
    sessionStorage.setItem(
      'esr_items_focus',
      JSON.stringify({ warehouseId: String(warehouseId), search: currentItem.internal_code || currentItem.name })
    );
    goto('/items');
  }

  function alternarTraslado(warehouseId) {
    trasladando = trasladando === warehouseId ? null : warehouseId;
    trasladarDestino = almacenes.find((a) => String(a.id) !== String(warehouseId))
      ? String(almacenes.find((a) => String(a.id) !== String(warehouseId)).id)
      : '';
    trasladarCantidad = 1;
  }

  /**
   * Traslada cantidad de un almacen a otro. NO toca `items.total_quantity` ni
   * `available_quantity`: la suma de la empresa no cambia, solo donde esta
   * repartida. Dos asientos en la bitacora —salida del origen, entrada del
   * destino— para que quede rastro.
   */
  async function trasladarAlmacen(origenId) {
    const cantidad = Math.max(0, Math.trunc(Number(trasladarCantidad) || 0));
    if (!trasladarDestino || cantidad <= 0) return;
    if (String(trasladarDestino) === String(origenId)) return;

    const filaOrigen = distribution.find((d) => String(d.warehouse_id) === String(origenId));
    const actualOrigen = filaOrigen ? Number(filaOrigen.quantity) || 0 : 0;
    if (cantidad > actualOrigen) {
      dangerModal.show(`No hay tanto que trasladar: en este almacén hay ${actualOrigen}.`);
      return;
    }
    const filaDestino = distribution.find((d) => String(d.warehouse_id) === String(trasladarDestino));
    const actualDestino = filaDestino ? Number(filaDestino.quantity) || 0 : 0;

    const nota = 'Traslado entre almacenes';
    await window.api.db.run(
      `INSERT INTO item_stock (item_id, warehouse_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity`,
      [itemId, origenId, actualOrigen - cantidad]
    );
    await window.api.db.run(
      `INSERT INTO item_stock (item_id, warehouse_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity`,
      [itemId, trasladarDestino, actualDestino + cantidad]
    );
    await window.api.db.run(
      `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
       VALUES (?, ?, ?, 'salida', ?, ?)`,
      [itemId, origenId, usuario()?.id ?? null, -cantidad, nota]
    );
    await window.api.db.run(
      `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
       VALUES (?, ?, ?, 'entrada', ?, ?)`,
      [itemId, trasladarDestino, usuario()?.id ?? null, cantidad, nota]
    );

    trasladando = null;
    await cargarDistribucion();
  }

  /** Quita el articulo de un almacen SIN existencias. No mueve nada: no hay nada que mover. */
  async function quitarAlmacen(warehouseId) {
    const fila = distribution.find((d) => String(d.warehouse_id) === String(warehouseId));
    if ((fila ? Number(fila.quantity) || 0 : 0) !== 0) {
      dangerModal.show('Solo se puede quitar un almacén sin existencias.');
      return;
    }
    if (!(await confirmDialog.ask('¿Quitar este artículo de este almacén?'))) return;
    await window.api.db.run(
      'DELETE FROM item_stock WHERE item_id = ? AND warehouse_id = ? AND quantity = 0',
      [itemId, warehouseId]
    );
    await cargarDistribucion();
  }

  /**
   * Mueve UNA unidad serializada de almacen. Calcado de `items/+page.svelte`.
   */
  async function moverUnidad(unidad, destino) {
    if (!destino || String(destino) === String(unidad.warehouse_id)) return;
    const nota = `Traslado de la unidad ${unidad.serial_number}`;

    await window.api.db.run('UPDATE item_serials SET warehouse_id = ? WHERE id = ?', [destino, unidad.id]);
    if (unidad.warehouse_id) {
      await window.api.db.run(
        `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
         VALUES (?, ?, ?, 'salida', -1, ?)`,
        [itemId, unidad.warehouse_id, usuario()?.id ?? null, nota]
      );
    }
    await window.api.db.run(
      `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
       VALUES (?, ?, ?, 'entrada', 1, ?)`,
      [itemId, destino, usuario()?.id ?? null, nota]
    );

    await cargarSeriales();
    await cargarDistribucion();
  }

  // ── Proveedores ───────────────────────────────────────────────────────────
  let mostrandoAgregarProveedor = false;
  let agregarSupplierId = '';
  let agregarEsPrincipal = false;

  $: proveedoresDisponibles = suppliers.filter(
    (s) => !itemSuppliers.some((it) => String(it.supplier_id) === String(s.id))
  );

  function alternarAgregarProveedor() {
    mostrandoAgregarProveedor = !mostrandoAgregarProveedor;
    agregarSupplierId = proveedoresDisponibles[0] ? String(proveedoresDisponibles[0].id) : '';
    agregarEsPrincipal = itemSuppliers.length === 0;
  }

  async function agregarProveedor() {
    if (!agregarSupplierId) return;
    if (agregarEsPrincipal) {
      await window.api.db.run('UPDATE item_suppliers SET is_primary = 0 WHERE item_id = ?', [itemId]);
    }
    await window.api.db.run(
      `INSERT INTO item_suppliers (item_id, supplier_id, is_primary) VALUES (?, ?, ?)
       ON CONFLICT (item_id, supplier_id) DO UPDATE SET is_primary = excluded.is_primary`,
      [itemId, agregarSupplierId, agregarEsPrincipal ? 1 : 0]
    );
    mostrandoAgregarProveedor = false;
    await cargarProveedores();
  }

  async function marcarPrincipal(supplierId) {
    await window.api.db.run('UPDATE item_suppliers SET is_primary = 0 WHERE item_id = ?', [itemId]);
    await window.api.db.run(
      'UPDATE item_suppliers SET is_primary = 1 WHERE item_id = ? AND supplier_id = ?',
      [itemId, supplierId]
    );
    await cargarProveedores();
  }

  async function quitarProveedor(supplierId) {
    if (!(await confirmDialog.ask('¿Quitar este proveedor del artículo?'))) return;
    await window.api.db.run(
      'DELETE FROM item_suppliers WHERE item_id = ? AND supplier_id = ?',
      [itemId, supplierId]
    );
    await cargarProveedores();
  }
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/settings/articles" aria-label="Volver al catálogo de artículos" title="Volver al catálogo de artículos">
      <Icon name="back" size={18} />
    </a>
    <button
      type="button"
      class="grupo-btn"
      on:click={recargar}
      disabled={recargando}
      aria-label="Recargar el artículo"
      title="Recargar el artículo"
    >
      <span class:girando={recargando}><Icon name="refresh" size={18} /></span>
    </button>
  </div>
</div>

{#if !cargando}
  <div class="record-layout">
    <!-- ── Formulario ───────────────────────────────────────────────────── -->
    <div class="record-col">
      <div class="card">
        <div class="book-header">
          <div class="section-title">{currentItem.name}</div>
          <span class="badge {recordStateBadgeClass(currentItem.is_active)}">
            {recordStateLabel(currentItem.is_active)}
          </span>
        </div>
        <div class="ficha-divider"></div>
        <div style="display: flex; flex-direction: column; gap: 15px;">
          <div style="display: flex; gap: 15px;">
            <div style="flex: 1;">
              <label for="itm-code">Código Interno</label>
              <input id="itm-code" type="text" bind:value={currentItem.internal_code} class="form-control">
            </div>
            <div style="flex: 2;">
              <label for="itm-name">Nombre *</label>
              <input id="itm-name" type="text" bind:value={currentItem.name} class="form-control">
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
            <div style="flex: 1;">
              <label for="itm-price">Precio de alquiler</label>
              <input id="itm-price" type="number" step="any" min="0" bind:value={currentItem.rental_price} class="form-control">
            </div>
            <div style="flex: 1;">
              <label for="itm-cost">Precio de compra</label>
              <input id="itm-cost" type="number" step="any" min="0" bind:value={currentItem.internal_cost} class="form-control">
            </div>
          </div>

          <div style="display: flex; gap: 15px;">
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
              <label for="itm-estado">Estado</label>
              <select id="itm-estado" bind:value={currentItem.is_active} class="form-control">
                <option value={1}>Activo</option>
                <option value={2}>Inactivo</option>
                <option value={0}>Archivado</option>
              </select>
            </div>
          </div>

          {#if isSerializedInventoryItem(currentItem)}
            <div>
              <label for="itm-serials">Seriales individuales</label>
              <textarea id="itm-serials" bind:value={serialLines} class="form-control" rows="4"
                        placeholder="Un serial por línea. Ej. QSC-K12-001"></textarea>
              <small style="color:var(--text-muted);display:block;margin-top:4px;">
                Registrar un serial es DEFINIR una unidad, no moverla de sitio.
              </small>
            </div>
            <div>
              <label for="itm-serial-almacen">Almacén de las unidades nuevas</label>
              <select id="itm-serial-almacen" bind:value={serialWarehouseId} class="form-control">
                {#each almacenes as almacen (almacen.id)}
                  <option value={String(almacen.id)}>{almacen.name}</option>
                {/each}
              </select>
              <small style="color:var(--text-muted);display:block;margin-top:4px;">
                Solo aplica a los seriales que se agreguen ahora. Los que ya estaban siguen donde están.
              </small>
            </div>
          {/if}

          <div>
            <label for="itm-notes">Notas</label>
            <textarea id="itm-notes" bind:value={currentItem.notes} class="form-control" rows="2"></textarea>
          </div>

          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-primary" on:click={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Almacenes + Proveedores ──────────────────────────────────────── -->
    <div class="record-col">
      <div class="card">
        <div class="book-header">
          <div class="section-title">Almacenes</div>
        </div>
        <p class="panel-hint">En qué almacenes está este artículo y cuánto hay en cada uno.</p>

        <table class="table">
          <thead>
            <tr>
              <th>Almacén</th>
              <th class="num">Cantidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each distribution as fila (fila.warehouse_id)}
              <tr>
                <td>{fila.warehouse_name}</td>
                <td class="num">{formatNumber(fila.quantity)}</td>
                <td style="text-align:right; white-space:nowrap;">
                  <button type="button" class="btn-link" on:click={() => verEnInventario(fila.warehouse_id)}>
                    Ver en Inventario
                  </button>
                  {#if !isSerializedInventoryItem(currentItem)}
                    {#if fila.quantity > 0}
                      <button type="button" class="btn-link" on:click={() => alternarTraslado(fila.warehouse_id)}>
                        Trasladar
                      </button>
                    {:else}
                      <button type="button" class="btn-link text-danger" on:click={() => quitarAlmacen(fila.warehouse_id)}>
                        Quitar
                      </button>
                    {/if}
                  {/if}
                </td>
              </tr>
              {#if trasladando === fila.warehouse_id}
                <tr>
                  <td colspan="3">
                    <div class="inline-form">
                      <div class="field">
                        <label for="to-wh">A</label>
                        <select id="to-wh" class="form-control" bind:value={trasladarDestino}>
                          {#each almacenes.filter((a) => String(a.id) !== String(fila.warehouse_id)) as almacen (almacen.id)}
                            <option value={String(almacen.id)}>{almacen.name}</option>
                          {/each}
                        </select>
                      </div>
                      <div class="field">
                        <label for="to-qty">Cantidad</label>
                        <input id="to-qty" class="form-control" type="number" min="1" max={fila.quantity} step="1" bind:value={trasladarCantidad} />
                      </div>
                      <button type="button" class="btn btn-primary btn-sm" on:click={() => trasladarAlmacen(fila.warehouse_id)}>
                        Trasladar
                      </button>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="book-header">
          <div class="section-title">Proveedores</div>
          {#if proveedoresDisponibles.length > 0}
            <button type="button" class="btn btn-primary btn-sm" on:click={alternarAgregarProveedor}>
              Agregar proveedor
            </button>
          {/if}
        </div>
        <p class="panel-hint">Quién suministra este artículo. Puede haber más de uno.</p>

        {#if mostrandoAgregarProveedor}
          <div class="inline-form">
            <div class="field">
              <label for="add-sup">Proveedor</label>
              <select id="add-sup" class="form-control" bind:value={agregarSupplierId}>
                {#each proveedoresDisponibles as proveedor (proveedor.id)}
                  <option value={String(proveedor.id)}>{proveedor.name}</option>
                {/each}
              </select>
            </div>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--text-muted);">
              <input type="checkbox" bind:checked={agregarEsPrincipal} /> Marcar como principal
            </label>
            <button type="button" class="btn btn-primary btn-sm" on:click={agregarProveedor}>Agregar</button>
          </div>
        {/if}

        {#if itemSuppliers.length === 0}
          <p class="empty-state">Todavía no hay proveedores registrados para este artículo.</p>
        {:else}
          <table class="table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Principal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each itemSuppliers as fila (fila.supplier_id)}
                <tr>
                  <td>{fila.supplier_name}</td>
                  <td>{fila.is_primary ? '★ Principal' : '—'}</td>
                  <td style="text-align:right; white-space:nowrap;">
                    {#if !fila.is_primary}
                      <button type="button" class="btn-link" on:click={() => marcarPrincipal(fila.supplier_id)}>
                        ★ Principal
                      </button>
                    {/if}
                    <button type="button" class="btn-link text-danger" on:click={() => quitarProveedor(fila.supplier_id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  </div>

  {#if isSerializedInventoryItem(currentItem)}
    <div class="card">
      <div class="section-title">Números de serie ({serials.length})</div>
      {#if serials.length === 0}
        <p class="empty-state">Todavía no hay unidades registradas.</p>
      {:else}
        <table class="table">
          <thead>
            <tr>
              <th>Serial</th>
              <th>Estado</th>
              <th>Almacén</th>
            </tr>
          </thead>
          <tbody>
            {#each serials as unidad (unidad.id)}
              <tr>
                <td>{unidad.serial_number}</td>
                <td>{unidad.status}</td>
                <td>
                  <select
                    class="form-control"
                    style="width:auto;"
                    value={String(unidad.warehouse_id ?? '')}
                    on:change={(e) => moverUnidad(unidad, e.currentTarget.value)}
                  >
                    {#if !unidad.warehouse_id}<option value="">Sin almacén</option>{/if}
                    {#each almacenes as almacen (almacen.id)}
                      <option value={String(almacen.id)}>{almacen.name}</option>
                    {/each}
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
{/if}

<style>
  /* El nombre del artículo vive DENTRO de su propia tarjeta —igual que
     «Almacenes»/«Proveedores» titulan la suya—, no suelto arriba de la
     página. El divisor de abajo marca dónde termina el título y empieza
     el formulario, ya que no queda ningún texto de sección genérico ahí. */
  .ficha-divider {
    border-bottom: 1px solid var(--border-color);
    margin: 10px 0 15px;
  }

  .record-layout {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 15px;
    align-items: start;
  }
  .record-col {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  @media (max-width: 1100px) {
    .record-layout { grid-template-columns: 1fr; }
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .book-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }

  .inline-form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
    margin: 10px 0;
    padding: 12px;
    background: var(--bg-sunken, rgba(0,0,0,0.03));
    border-radius: var(--radius-sm);
  }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 9rem; }

  .num { text-align: right; }

  .btn-link {
    background: none;
    border: none;
    color: var(--primary);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 2px 6px;
  }
  .text-danger { color: var(--danger); }
</style>
