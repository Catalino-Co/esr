<script>
  import { onMount } from 'svelte';
  import { formatMoney, formatNumber } from '@esr/core';
  import { EmptyState, Icon, Modal } from '@esr/ui';

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

  let almacenes = [];
  let categorias = [];
  let almacenId = '';
  let busqueda = '';
  let categoriaId = '';
  let soloBajo = false;

  let items = [];
  let error = '';

  async function cargarCatalogos() {
    almacenes = await window.api.db.get(
      "SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, name"
    );
    categorias = await window.api.db.get('SELECT id, name FROM categories ORDER BY name ASC');

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
    // «Stock bajo» se compara contra el TOTAL y no contra lo disponible hoy:
    // responde «hay que comprar mas», que es una decision de compra. Un articulo
    // con todo alquilado no es stock bajo, esta ocupado.
    if (soloBajo) {
      where.push('COALESCE(i.min_stock, 0) > 0 AND COALESCE(i.total_quantity, 0) < COALESCE(i.min_stock, 0)');
    }

    /*
     * En un articulo SERIALIZADO lo que hay en un almacen son sus unidades, no
     * una cantidad: por eso la primera rama cuenta `item_serials` y la segunda
     * lee `item_stock`. Son dos modelos y mezclarlos daria dos numeros
     * contradiciendose.
     */
    items = await window.api.db.get(
      `SELECT i.id, i.internal_code, i.name, i.item_type, i.total_quantity,
              i.available_quantity, i.rental_price, i.min_stock,
              c.name AS cat_name,
              p.name AS supplier_name,
              COALESCE(u.abbr, u.name) AS uom_abbr,
              CASE WHEN i.item_type = 'serializado' THEN (
                     SELECT COUNT(*) FROM item_serials s
                      WHERE s.item_id = i.id AND s.warehouse_id = ?
                        AND s.status NOT IN ('retirado', 'mantenimiento'))
                   ELSE COALESCE((SELECT st.quantity FROM item_stock st
                                   WHERE st.item_id = i.id AND st.warehouse_id = ?), 0)
              END AS warehouse_quantity
         FROM items i
         LEFT JOIN categories c ON c.id = i.category_id
         LEFT JOIN suppliers p ON p.id = i.supplier_id
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

  // ── Dialogo: movimiento de stock ─────────────────────────────────────────
  let moviendo = false;
  let errorMovimiento = '';
  let movimiento = { id: null, name: '', tipo: 'entrada', cantidad: 1, notas: '', actual: 0 };

  function abrirMovimiento(item) {
    movimiento = {
      id: item.id,
      name: item.name,
      tipo: 'entrada',
      cantidad: 1,
      notas: '',
      actual: Number(item.warehouse_quantity) || 0
    };
    errorMovimiento = '';
    moviendo = true;
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

  async function registrarMovimiento() {
    const pedida = Math.max(0, Math.trunc(Number(movimiento.cantidad) || 0));
    if (movimiento.tipo !== 'ajuste' && pedida === 0) {
      errorMovimiento = 'La cantidad debe ser mayor que cero.';
      return;
    }
    if (resultante < 0) {
      errorMovimiento = `No hay tanto que sacar: en este almacén hay ${movimiento.actual}.`;
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
        [movimiento.id, almacenId, resultante]
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
        `INSERT INTO stock_movements (item_id, warehouse_id, user_id, type, quantity, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [movimiento.id, almacenId, usuario?.id ?? null, movimiento.tipo, delta, movimiento.notas || null]
      );

      moviendo = false;
      await cargarItems();
    } catch (e) {
      errorMovimiento = String(e?.message || 'No se pudo registrar el movimiento.');
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center; justify-content: space-between; display: flex; width: 100%;">
    <span>Inventario</span>
    <span style="display: flex; gap: 8px;">
      <a href="/movements" class="btn btn-secondary btn-sm">Movimientos</a>
      <a href="/settings/articles" class="btn btn-secondary btn-sm">Catálogo de artículos</a>
    </span>
  </div>

  <div class="filtros">
    <input
      type="text"
      class="form-control"
      placeholder="Nombre o código…"
      bind:value={busqueda}
      on:input={cargarItems}
    />
    <select class="form-control" bind:value={almacenId} on:change={cargarItems}>
      {#each almacenes as almacen (almacen.id)}
        <option value={String(almacen.id)}>{almacen.name}</option>
      {/each}
    </select>
    <select class="form-control" bind:value={categoriaId} on:change={cargarItems}>
      <option value="">Cualquier categoría</option>
      {#each categorias as cat (cat.id)}
        <option value={String(cat.id)}>{cat.name}</option>
      {/each}
    </select>
    <label class="casilla">
      <input type="checkbox" bind:checked={soloBajo} on:change={cargarItems} />
      <span>Solo stock bajo</span>
    </label>
  </div>

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
      <table class="table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th class="num">En almacén</th>
            <th class="num">Total</th>
            <th class="num">Disponible</th>
            <th class="num">Mínimo</th>
            <th class="num">Precio</th>
            <th>Proveedor</th>
            <th style="width: 90px; text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item (item.id)}
            <tr>
              <td>{item.internal_code || '—'}</td>
              <td style="font-weight: 500;">{item.name}</td>
              <td>{item.cat_name || '—'}</td>
              <td class="num">{formatNumber(item.warehouse_quantity ?? 0)}</td>
              <td
                class="num"
                class:bajo={(item.min_stock ?? 0) > 0 && (item.total_quantity ?? 0) < item.min_stock}
              >
                {formatNumber(item.total_quantity ?? 0)}
              </td>
              <!-- La unidad acompaña a lo DISPONIBLE, que es la cifra con la que
                   se decide si se puede comprometer algo. -->
              <td class="num">
                {formatNumber(item.available_quantity ?? 0)}
                {#if item.uom_abbr}<span class="uom">{item.uom_abbr}</span>{/if}
              </td>
              <td class="num">{item.min_stock ?? 0}</td>
              <td class="num">{formatMoney(item.rental_price ?? 0)}</td>
              <td>{item.supplier_name || '—'}</td>
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
                  <a
                    class="row-action"
                    href="/settings/articles"
                    aria-label="Editar {item.name}"
                    title="Editar en el catálogo"
                  >
                    <Icon name="edit" />
                  </a>
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
              <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">
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
    <div class="form-field full">
      <label for="mov-notas">Observaciones</label>
      <input id="mov-notas" type="text" placeholder="Motivo del movimiento" bind:value={movimiento.notas} />
    </div>
  </div>

  <p class="panel-hint ayuda">
    En este almacén hay <strong>{formatNumber(movimiento.actual)}</strong> y quedarán
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

<style>
  .filtros {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-4);
  }

  .filtros .form-control {
    width: auto;
    min-width: 11rem;
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

  .form-control {
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    outline: none;
    box-sizing: border-box;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .form-control:focus {
    border-color: var(--primary);
  }
</style>
