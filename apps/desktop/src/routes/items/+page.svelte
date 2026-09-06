<script>
  import { onMount } from 'svelte';
  import { formatNumber } from '@esr/core';
  import { EmptyState, Icon, Modal } from '@esr/ui';
  import FilterBar from '$lib/components/list/FilterBar.svelte';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  /**
   * Inventario: CUANTO hay y DONDE.
   *
   * Separado del catalogo, que vive en Ajustes › Articulos y responde a otra
   * pregunta —que existe—. Por eso aqui no hay estados: activar, inactivar o
   * archivar un articulo no es algo que se decida mirando existencias.
   *
   * Misma distribucion que la de ESR Cloud. El almacen INFORMA y NO RESERVA:
   * cotizar y aprobar siguen comprometiendo contra el total de la empresa.
   *
   * Va en sintaxis Svelte CLASICA (`let`, `$:`, `on:`), como el resto de Desktop.
   */

  /** El almacen elegido se recuerda entre visitas. */
  const CLAVE_ALMACEN = 'esr_almacen';

  /**
   * Las tres condiciones fisicas. Sentence case, como el resto del sistema.
   * @type {Record<string, string>}
   */
  const CONDICIONES = {
    disponible: 'Disponible',
    mantenimiento: 'Mantenimiento',
    retirado: 'Retirado'
  };

  let almacenes = [];
  let categorias = [];
  let almacenId = '';
  let busqueda = '';
  let categoriaId = '';
  let condicion = '';
  let soloBajo = false;
  /** `ultimo` | `promedio3`, de Configuracion > Generales. */
  let reglaValoracion = 'ultimo';

  let items = [];
  let error = '';
  let recargando = false;

  $: opcionesAlmacen = almacenes.map((a) => ({ value: String(a.id), label: a.name }));
  $: opcionesCategoria = [
    { value: '', label: 'Cualquier categoría' },
    ...categorias.map((c) => ({ value: String(c.id), label: c.name }))
  ];
  $: opcionesCondicion = [
    { value: '', label: 'Cualquier condición' },
    ...Object.entries(CONDICIONES).map(([valor, etiqueta]) => ({ value: valor, label: etiqueta }))
  ];

  async function cargarCatalogos() {
    almacenes = await window.api.db.get(
      "SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, name"
    );
    categorias = await window.api.db.get('SELECT id, name FROM categories ORDER BY name ASC');

    const empresa = await window.api.db.get(
      'SELECT default_valuation_rule FROM company_info WHERE id = 1'
    );
    reglaValoracion = empresa?.[0]?.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';

    const recordado = localStorage.getItem(CLAVE_ALMACEN);
    const existe = almacenes.some((a) => String(a.id) === recordado);
    almacenId = existe ? recordado : almacenes[0] ? String(almacenes[0].id) : '';
  }

  async function cargarItems() {
    if (!almacenId) {
      items = [];
      return;
    }
    localStorage.setItem(CLAVE_ALMACEN, almacenId);

    const where = ['i.is_active = 1'];
    const params = [];

    if (busqueda.trim()) {
      where.push('(i.name LIKE ? OR i.internal_code LIKE ?)');
      params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
    }
    if (categoriaId) {
      where.push('i.category_id = ?');
      params.push(categoriaId);
    }
    // «Stock bajo» se compara contra el TOTAL DE ESTE ALMACEN y no contra lo
    // disponible hoy: responde «hay que comprar mas para este almacen», que es
    // una decision de compra. Un articulo con todo alquilado no es stock bajo,
    // esta ocupado. La vista agregada de toda la empresa queda para un reporte
    // futuro, fuera de esta pantalla.
    if (soloBajo) {
      where.push(`COALESCE(inv.min_stock, 0) > 0 AND COALESCE((
        CASE WHEN i.item_type = 'serializado' THEN (
               SELECT COUNT(*) FROM item_serials s
                WHERE s.item_id = i.id AND s.warehouse_id = ?
                  AND s.status NOT IN ('retirado', 'mantenimiento'))
             ELSE COALESCE((SELECT st.quantity FROM item_stock st
                             WHERE st.item_id = i.id AND st.warehouse_id = ?), 0)
        END
      ), 0) < COALESCE(inv.min_stock, 0)`);
      params.push(almacenId, almacenId);
    }
    if (condicion) {
      where.push("COALESCE(inv.physical_status, 'disponible') = ?");
      params.push(condicion);
    }

    // Cuantas entradas mira la valoracion: 1 con «ultimo», 3 con «promedio3». La
    // regla viaja como un LIMITE y no como un CASE, porque el promedio de una
    // sola entrada es esa entrada: una consulta sirve para las dos reglas.
    const tope = reglaValoracion === 'promedio3' ? 3 : 1;

    /*
     * En un articulo SERIALIZADO lo que hay en un almacen son sus unidades, no
     * una cantidad: por eso la primera rama cuenta `item_serials` y la segunda
     * lee `item_stock`. Son dos modelos y mezclarlos daria dos numeros
     * contradiciendose.
     */
    items = await window.api.db.get(
      `SELECT i.id, i.internal_code, i.name, i.item_type,
              i.rental_price, i.internal_cost,
              COALESCE(inv.min_stock, 0) AS min_stock,
              COALESCE(inv.physical_status, 'disponible') AS physical_status,
              inv.location,
              c.name AS cat_name,
              COALESCE(u.abbr, u.name) AS uom_abbr,
              CASE WHEN i.item_type = 'serializado' THEN (
                     SELECT COUNT(*) FROM item_serials s
                      WHERE s.item_id = i.id AND s.warehouse_id = ?
                        AND s.status NOT IN ('retirado', 'mantenimiento'))
                   ELSE COALESCE((SELECT st.quantity FROM item_stock st
                                   WHERE st.item_id = i.id AND st.warehouse_id = ?), 0)
              END AS warehouse_quantity,
              (SELECT AVG(m.unit_cost) FROM (
                  SELECT sm.unit_cost FROM stock_movements sm
                   WHERE sm.item_id = i.id AND sm.unit_cost IS NOT NULL AND sm.quantity > 0
                   ORDER BY sm.created_at DESC, sm.id DESC
                   LIMIT ${tope}
               ) m) AS valuation_cost
         FROM items i
         -- LEFT JOIN y no INNER: un articulo anterior a la migracion 0010, o
         -- creado por una via que no pase por el catalogo, no tiene fila y aun
         -- asi tiene que verse. Sin fila, minimo cero y «disponible».
         LEFT JOIN item_inventory inv ON inv.item_id = i.id
         LEFT JOIN categories c ON c.id = i.category_id
         LEFT JOIN units_of_measure u ON u.id = i.uom_id
        WHERE ${where.join(' AND ')}
        ORDER BY i.name ASC`,
      [almacenId, almacenId, ...params]
    );
  }

  async function cargar() {
    if (!window.api?.db) return;
    error = '';
    await cargarCatalogos();
    await cargarItems();
  }

  onMount(() => cargar());

  async function recargar() {
    recargando = true;
    try {
      await cargar();
    } finally {
      recargando = false;
    }
  }

  /**
   * Donde esta repartido UN articulo: una fila por almacen activo, las de cero
   * incluidas. Es la vuelta de la pantalla —que fija el almacen y recorre los
   * articulos— y la usan los dos dialogos: el de movimiento, para que la cifra
   * de referencia siga al almacen elegido, y el de existencias por almacen.
   */
  async function cargarReparto(itemId) {
    return await window.api.db.get(
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

  // ── Dialogo: movimiento de stock ─────────────────────────────────────────
  let moviendo = false;
  let errorMovimiento = '';
  let movimiento = {
    id: null, name: '', tipo: 'entrada', cantidad: 1, costo: '', notas: '',
    actual: 0, warehouseId: ''
  };
  /** Cuanto hay en cada almacen, para que la cifra siga al almacen elegido. */
  let repartoMovimiento = [];

  $: almacenMovimiento =
    almacenes.find((a) => String(a.id) === String(movimiento.warehouseId))?.name || 'este almacén';

  async function abrirMovimiento(item) {
    movimiento = {
      id: item.id,
      name: item.name,
      tipo: 'entrada',
      cantidad: 1,
      // Se PROPONE el precio de compra del articulo y se guarda la copia que
      // quede aqui. Sin precio de compra entra vacio y no bloquea: «no lo se» es
      // una respuesta valida y se guarda como tal.
      costo: Number(item.internal_cost) > 0 ? String(item.internal_cost) : '',
      notas: '',
      actual: Number(item.warehouse_quantity) || 0,
      // Se propone el almacen que se esta mirando, pero se elige aqui mismo: el
      // mismo articulo vive en varios almacenes y dar entrada en otro obligaba a
      // cerrar esto, cambiar la barra y volver a abrirlo.
      warehouseId: almacenId
    };
    errorMovimiento = '';
    repartoMovimiento = [];
    moviendo = true;

    repartoMovimiento = await cargarReparto(item.id);
    sincronizarActual();
  }

  /** La cifra de referencia es la del almacen ELEGIDO, no la del que se mira. */
  function sincronizarActual() {
    const fila = repartoMovimiento.find(
      (d) => String(d.warehouse_id) === String(movimiento.warehouseId)
    );
    movimiento.actual = fila ? Number(fila.quantity) || 0 : 0;
  }

  /**
   * Lo que quedara en el almacen.
   *
   * «Ajuste» FIJA la cantidad; entrada y salida la suman y la restan. Sin esta
   * distincion, un ajuste se lee como una suma y se registra el doble.
   */
  $: resultante =
    movimiento.tipo === 'ajuste'
      ? Number(movimiento.cantidad) || 0
      : movimiento.tipo === 'entrada'
        ? movimiento.actual + (Number(movimiento.cantidad) || 0)
        : movimiento.actual - (Number(movimiento.cantidad) || 0);

  // ── Dialogo: existencias del articulo ────────────────────────────────────
  //
  // Minimo, condicion fisica y ubicacion. Escribe en `item_inventory` y NO toca
  // `items`: son las existencias de un articulo, no su definicion. Y no mueve ni
  // una unidad; para eso esta el movimiento, que ademas deja constancia.
  let editando = false;
  let errorExistencias = '';
  let existencias = { id: null, name: '', minimo: 0, condicion: 'disponible', ubicacion: '' };

  function abrirExistencias(item) {
    existencias = {
      id: item.id,
      name: item.name,
      minimo: Number(item.min_stock) || 0,
      condicion: item.physical_status || 'disponible',
      ubicacion: item.location ?? ''
    };
    errorExistencias = '';
    editando = true;
  }

  async function guardarExistencias() {
    const minimo = Math.max(0, Math.trunc(Number(existencias.minimo) || 0));
    if (!CONDICIONES[existencias.condicion]) {
      errorExistencias = 'Condición física no válida.';
      return;
    }

    try {
      // `INSERT OR REPLACE` y no un `UPDATE`: un articulo anterior a la
      // migracion 0010 no tiene fila, y exigirsela dejaria su minimo sin poder
      // guardarse sin que nada avisara.
      await window.api.db.run(
        `INSERT INTO item_inventory (item_id, min_stock, physical_status, location)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (item_id) DO UPDATE SET
           min_stock = excluded.min_stock,
           physical_status = excluded.physical_status,
           location = excluded.location`,
        [existencias.id, minimo, existencias.condicion, existencias.ubicacion || null]
      );
      editando = false;
      await cargarItems();
    } catch (e) {
      errorExistencias = String(e?.message || 'No se pudieron guardar las existencias.');
    }
  }

  async function registrarMovimiento() {
    const pedida = Math.max(0, Math.trunc(Number(movimiento.cantidad) || 0));
    if (movimiento.tipo !== 'ajuste' && pedida === 0) {
      errorMovimiento = 'La cantidad debe ser mayor que cero.';
      return;
    }
    if (!movimiento.warehouseId) {
      errorMovimiento = 'Elija el almacén del movimiento.';
      return;
    }
    if (resultante < 0) {
      errorMovimiento = `No hay tanto que sacar: en ${almacenMovimiento} hay ${movimiento.actual}.`;
      return;
    }

    // Vacio es «no lo se», y eso se guarda como NULL, no como cero: la
    // valoracion prefiere decir «—» a decir una cifra falsa. Y solo en la
    // ENTRADA: una salida no compra nada y un ajuste corrige un recuento.
    const costoBruto = String(movimiento.costo ?? '').trim();
    const costo = movimiento.tipo === 'entrada' && costoBruto !== '' ? Number(costoBruto) : null;
    if (costo !== null && (!Number.isFinite(costo) || costo < 0)) {
      errorMovimiento = 'El costo unitario debe ser un número mayor o igual a 0.';
      return;
    }

    const usuario = JSON.parse(sessionStorage.getItem('esr_user') || 'null');

    try {
      /*
       * Tres escrituras que tienen que ir juntas: la existencia del almacen, el
       * total del articulo y el rastro de quien lo movio.
       *
       * En ESR Pro `items.total_quantity` SIGUE siendo el total —esta app guarda
       * los numeros en vez de calcularlos—, asi que hay que mantener las dos
       * cosas: cuanto hay y donde esta. Si solo se tocara `item_stock`, la
       * columna «Total» y todo lo que cuelga de ella se quedarian congelados.
       */
      await window.api.db.run(
        `INSERT INTO item_stock (item_id, warehouse_id, quantity) VALUES (?, ?, ?)
         ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity`,
        [movimiento.id, movimiento.warehouseId, resultante]
      );

      const delta = resultante - movimiento.actual;
      await window.api.db.run(
        'UPDATE items SET total_quantity = MAX(0, COALESCE(total_quantity, 0) + ?) WHERE id = ?',
        [delta, movimiento.id]
      );
      await window.api.db.run(
        'UPDATE items SET available_quantity = MAX(0, COALESCE(available_quantity, 0) + ?) WHERE id = ?',
        [delta, movimiento.id]
      );

      await window.api.db.run(
        `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [movimiento.id, movimiento.warehouseId, usuario?.id ?? null, movimiento.tipo, delta,
         movimiento.notas || null, costo]
      );

      moviendo = false;
      await cargarItems();
    } catch (e) {
      errorMovimiento = String(e?.message || 'No se pudo registrar el movimiento.');
    }
  }

  // ── Dialogo: existencias por almacen ─────────────────────────────────────
  //
  // La vuelta de la pantalla: aqui se fija el articulo y se recorren los
  // almacenes, que es lo que contesta «donde esta esto» —imposible de contestar
  // mirando un almacen cada vez cuando el articulo esta repartido—.
  let viendoReparto = false;
  let errorReparto = '';
  let repartoItem = { id: null, name: '', serializado: false };
  let reparto = [];
  let unidades = [];

  async function abrirReparto(item) {
    repartoItem = { id: item.id, name: item.name, serializado: item.item_type === 'serializado' };
    errorReparto = '';
    reparto = [];
    unidades = [];
    viendoReparto = true;
    await refrescarReparto();
  }

  async function refrescarReparto() {
    reparto = await cargarReparto(repartoItem.id);
    unidades = repartoItem.serializado
      ? await window.api.db.get(
          `SELECT s.id, s.serial_number, s.status, s.warehouse_id, w.name AS warehouse_name
             FROM item_serials s
             LEFT JOIN warehouses w ON w.id = s.warehouse_id
            WHERE s.item_id = ?
            ORDER BY s.serial_number ASC`,
          [repartoItem.id]
        )
      : [];
  }

  /**
   * Mueve UNA unidad de almacen.
   *
   * El movimiento de stock no sirve aqui: en un serializado las existencias son
   * sus unidades, y mover un numero no moveria ninguna. Se dejan los DOS
   * asientos —la salida de donde estaba y la entrada donde queda—, porque una
   * unidad que aparece en otro sitio sin rastro es lo que la bitacora existe
   * para evitar.
   */
  async function moverUnidad(unidad, destino) {
    if (!destino || String(destino) === String(unidad.warehouse_id)) return;
    errorReparto = '';
    const usuario = JSON.parse(sessionStorage.getItem('esr_user') || 'null');
    const nota = `Traslado de la unidad ${unidad.serial_number}`;

    try {
      await window.api.db.run('UPDATE item_serials SET warehouse_id = ? WHERE id = ?', [
        destino,
        unidad.id
      ]);
      if (unidad.warehouse_id) {
        await window.api.db.run(
          `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
           VALUES (?, ?, ?, 'salida', -1, ?)`,
          [repartoItem.id, unidad.warehouse_id, usuario?.id ?? null, nota]
        );
      }
      await window.api.db.run(
        `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
         VALUES (?, ?, ?, 'entrada', 1, ?)`,
        [repartoItem.id, destino, usuario?.id ?? null, nota]
      );

      await refrescarReparto();
      await cargarItems();
    } catch (e) {
      errorReparto = String(e?.message || 'No se pudo mover la unidad.');
    }
  }
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/" aria-label="Volver al inicio" title="Volver al inicio">
      <Icon name="back" size={18} />
    </a>
    <button
      type="button"
      class="grupo-btn"
      on:click={recargar}
      disabled={recargando}
      aria-label="Recargar el inventario"
      title="Recargar el inventario"
    >
      <span class:girando={recargando}><Icon name="refresh" size={18} /></span>
    </button>
  </div>

  <div class="herramientas-datos">
    <StatusSelect
      value={almacenId}
      options={opcionesAlmacen}
      label="Almacén"
      onchange={(e) => { almacenId = e.currentTarget.value; cargarItems(); }}
    />
    <StatusSelect
      value={categoriaId}
      options={opcionesCategoria}
      label="Categoría"
      onchange={(e) => { categoriaId = e.currentTarget.value; cargarItems(); }}
    />
    <StatusSelect
      value={condicion}
      options={opcionesCondicion}
      label="Condición"
      onchange={(e) => { condicion = e.currentTarget.value; cargarItems(); }}
    />
    <a href="/movements" class="btn btn-secondary btn-sm">Movimientos</a>
    <a href="/settings/articles" class="btn btn-secondary btn-sm">Catálogo de artículos</a>
  </div>
</div>

<div class="card">
  <FilterBar
    search={{ placeholder: 'Nombre o código…', value: busqueda }}
    onSearch={(v) => { busqueda = v; cargarItems(); }}
  >
    <svelte:fragment slot="actions">
      <label class="casilla">
        <input type="checkbox" bind:checked={soloBajo} on:change={cargarItems} />
        <span>Solo stock bajo</span>
      </label>
    </svelte:fragment>
  </FilterBar>

  {#if error}<div class="alert alert-danger">{error}</div>{/if}

  {#if almacenes.length === 0}
    <EmptyState
      icon="box"
      title="Sin almacenes"
      description="El inventario se ve por almacén. Cree el primero para empezar."
      actionLabel="Ir a Almacenes"
      actionHref="/settings/warehouses"
    />
  {:else}
    <div class="table-wrapper">
      <table class="table table--acento">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th class="num">Total</th>
            <th class="num">Disponible</th>
            <th class="num">Mínimo</th>
            <th>Condición</th>
            <th style="width: 90px; text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item (item.id)}
            <tr>
              <td>{item.internal_code || '—'}</td>
              <td style="font-weight: 500;">{item.name}</td>
              <td>{item.cat_name || '—'}</td>
              <!-- Total y Disponible son la existencia FISICA de este almacen:
                   el almacen informa y no reserva, asi que sin un «reservado
                   por almacen» las dos cifras son la misma. La vista agregada
                   de toda la empresa queda para un reporte futuro. -->
              <td
                class="num"
                class:bajo={(item.min_stock ?? 0) > 0 && (item.warehouse_quantity ?? 0) < item.min_stock}
              >
                {formatNumber(item.warehouse_quantity ?? 0)}
              </td>
              <td class="num">
                {formatNumber(item.warehouse_quantity ?? 0)}
                {#if item.uom_abbr}<span class="uom">{item.uom_abbr}</span>{/if}
              </td>
              <td class="num">{item.min_stock ?? 0}</td>
              <td class:atencion={item.physical_status !== 'disponible'}>
                {CONDICIONES[item.physical_status] || '—'}
              </td>
              <td style="text-align: right; white-space: nowrap;">
                <div class="row-actions" style="justify-content: flex-end;">
                  <button
                    class="row-action"
                    on:click={() => abrirMovimiento(item)}
                    disabled={item.item_type === 'serializado'}
                    aria-label="Mover existencias de {item.name}"
                    title={item.item_type === 'serializado'
                      ? 'Sus existencias son sus seriales: regístrelos o retírelos desde la ficha del artículo.'
                      : 'Entrada, salida o ajuste'}
                  >
                    <Icon name="stock" />
                  </button>
                  <!-- El mismo artículo puede estar repartido en varios almacenes,
                       y la tabla solo enseña uno cada vez. -->
                  <button
                    class="row-action"
                    on:click={() => abrirReparto(item)}
                    aria-label="Existencias por almacén de {item.name}"
                    title="En qué almacenes está"
                  >
                    <Icon name="display" />
                  </button>
                  <!-- Edita las EXISTENCIAS, no la ficha: mínimo, condición y
                       ubicación. Lo que el artículo es y cuánto vale se cambia
                       en el catálogo, y desde aquí no se llega por descuido. -->
                  <button
                    class="row-action"
                    on:click={() => abrirExistencias(item)}
                    aria-label="Existencias de {item.name}"
                    title="Mínimo, condición y ubicación"
                  >
                    <Icon name="edit" />
                  </button>
                  <!-- Abre la pantalla de movimientos YA FILTRADA por este
                       artículo; quitando el filtro allí se ve el almacén entero. -->
                  <a
                    class="row-action"
                    href="/movements?item={item.id}"
                    aria-label="Historial de {item.name}"
                    title="Historial de movimientos"
                  >
                    <Icon name="history" />
                  </a>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                {soloBajo
                  ? 'Ningún artículo está por debajo de su mínimo.'
                  : 'No hay artículos para mostrar.'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<Modal bind:show={moviendo} title="Movimiento de stock" maxWidth="480px">
  {#if errorMovimiento}<div class="alert alert-danger">{errorMovimiento}</div>{/if}

  <p class="panel-hint">{movimiento.name}</p>

  <div class="form-grid">
    <!--
      El almacén se ELIGE aquí, y no se hereda callado del selector de la barra:
      el mismo artículo vive en varios almacenes, y dar entrada en otro obligaba
      a cerrar esto, cambiar la barra y volver a abrirlo.
    -->
    <div class="form-field">
      <label for="mov-almacen">Almacén</label>
      <select id="mov-almacen" bind:value={movimiento.warehouseId} on:change={sincronizarActual}>
        {#each almacenes as almacen (almacen.id)}
          <option value={String(almacen.id)}>{almacen.name}</option>
        {/each}
      </select>
    </div>
    <div class="form-field">
      <label for="mov-tipo">Tipo</label>
      <select id="mov-tipo" bind:value={movimiento.tipo}>
        <option value="entrada">Entrada</option>
        <option value="salida">Salida</option>
        <option value="ajuste">Ajuste</option>
      </select>
    </div>
    <div class="form-field">
      <label for="mov-cant">Cantidad</label>
      <input id="mov-cant" type="number" min="0" step="1" bind:value={movimiento.cantidad} />
    </div>
    <!--
      Solo en la ENTRADA: una salida no compra nada y un ajuste corrige un
      recuento. Pedir el costo en los tres ensuciaría la valoración con números
      que no son precios de compra.

      No es obligatorio: vacío significa «no lo sé» y se guarda como tal, para
      que la valoración pueda decir «—» en vez de una cifra inventada.
    -->
    {#if movimiento.tipo === 'entrada'}
      <div class="form-field">
        <label for="mov-costo">Costo unitario</label>
        <input
          id="mov-costo"
          type="number"
          min="0"
          step="any"
          placeholder="Sin costo"
          bind:value={movimiento.costo}
        />
        <span class="ayuda-campo">Se guarda en este movimiento; no cambia el artículo.</span>
      </div>
    {/if}
    <div class="form-field full">
      <label for="mov-notas">Observaciones</label>
      <input id="mov-notas" type="text" placeholder="Motivo del movimiento" bind:value={movimiento.notas} />
    </div>
  </div>

  <p class="panel-hint ayuda">
    En <strong>{almacenMovimiento}</strong> hay <strong>{formatNumber(movimiento.actual)}</strong> y
    quedarán
    <strong class:negativo={resultante < 0}>{formatNumber(resultante)}</strong>.
    {#if movimiento.tipo === 'ajuste'}Un ajuste fija la cantidad, no la suma.{/if}
  </p>

  <svelte:fragment slot="footer">
    <button class="btn btn-secondary" on:click={() => (moviendo = false)}>Cancelar</button>
    <button class="btn btn-primary" on:click={registrarMovimiento} disabled={resultante < 0}>
      Registrar
    </button>
  </svelte:fragment>
</Modal>

<!-- Donde esta repartido el articulo. -->
<Modal bind:show={viendoReparto} title="Existencias por almacén" maxWidth="520px">
  {#if errorReparto}<div class="alert alert-danger">{errorReparto}</div>{/if}

  <p class="panel-hint">{repartoItem.name}</p>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Almacén</th>
          <th class="num">Cantidad</th>
        </tr>
      </thead>
      <tbody>
        {#each reparto as fila (fila.warehouse_id)}
          <tr>
            <td>{fila.warehouse_name}</td>
            <td class="num">{formatNumber(fila.quantity ?? 0)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- En un serializado las existencias son unidades concretas, así que moverlas
       de almacén es mover ESA unidad y no un número. Va aquí y no en el catálogo:
       allí se define qué unidades existen, aquí dónde están. -->
  {#if repartoItem.serializado}
    <p class="panel-hint ayuda">Unidades</p>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Serial</th>
            <th>Estado</th>
            <th>Almacén</th>
          </tr>
        </thead>
        <tbody>
          {#each unidades as unidad (unidad.id)}
            <tr>
              <td>{unidad.serial_number}</td>
              <td>{unidad.status}</td>
              <td>
                <select
                  value={String(unidad.warehouse_id ?? '')}
                  on:change={(e) => moverUnidad(unidad, e.currentTarget.value)}
                  aria-label="Almacén de {unidad.serial_number}"
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
    </div>
  {/if}

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => (viendoReparto = false)}>Cerrar</button>
  </div>
</Modal>

<!-- Existencias del articulo: minimo, condicion y ubicacion. -->
<Modal bind:show={editando} title="Existencias del artículo" maxWidth="480px">
  {#if errorExistencias}<div class="alert alert-danger">{errorExistencias}</div>{/if}

  <p class="panel-hint">{existencias.name}</p>

  <div class="form-grid">
    <div class="form-field">
      <label for="inv-min">Mínimo</label>
      <input id="inv-min" type="number" min="0" step="1" bind:value={existencias.minimo} />
      <span class="ayuda-campo">
        Por debajo de este total el artículo sale en «Solo stock bajo». Se compara con el
        total de este almacén, no con lo disponible hoy.
      </span>
    </div>
    <div class="form-field">
      <label for="inv-cond">Condición física</label>
      <select id="inv-cond" bind:value={existencias.condicion}>
        {#each Object.entries(CONDICIONES) as [valor, etiqueta] (valor)}
          <option value={valor}>{etiqueta}</option>
        {/each}
      </select>
      <span class="ayuda-campo">
        En qué estado está la mercancía. Si se puede cotizar o no es otra cosa, y se decide
        en el catálogo.
      </span>
    </div>
    <div class="form-field full">
      <label for="inv-ubic">Ubicación</label>
      <input id="inv-ubic" type="text" placeholder="Pasillo, estante, contenedor…" bind:value={existencias.ubicacion} />
    </div>
  </div>

  <p class="panel-hint ayuda">
    Guardar esto no mueve ni una unidad. Para cambiar cuánto hay, use el movimiento de stock.
  </p>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => (editando = false)}>Cancelar</button>
    <button class="btn btn-primary" on:click={guardarExistencias}>Guardar</button>
  </div>
</Modal>

<style>
  /* Una condicion que no es «disponible» se marca, pero sin el rojo del stock
     bajo: que algo este en mantenimiento es una situacion, no un problema. */
  .atencion {
    color: var(--warning-text);
    font-weight: 600;
  }

  .ayuda-campo {
    display: block;
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .casilla {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--font-sm);
    white-space: nowrap;
    margin: 0;
  }

  .num {
    text-align: right;
  }

  /* La unidad NO va en `--text-placeholder`: ese token da 2.56:1 y solo vale
     para placeholders e iconos decorativos. Esto se lee. */
  .uom {
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  /* El aviso va en el TOTAL, que es contra lo que se compara el mínimo. */
  .bajo {
    color: var(--danger-text);
    font-weight: 600;
  }

  .ayuda {
    margin: var(--sp-3) 0 0;
  }

  .negativo {
    color: var(--danger-text);
  }
</style>
