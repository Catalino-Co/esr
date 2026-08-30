<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    calculateQuoteLineTotal,
    calculateQuoteTotals,
    formatMoney,
    statusBadgeClass,
    statusLabel
  } from '@esr/core';
  import { validateQuoteInput } from '@esr/schemas';
  import { generateQuotationPDF, quoteItemLabel } from '@esr/reports';
  import { Modal, PdfPreviewModal } from '@esr/ui';

  /**
   * Ficha de cotizacion de ESR Pro.
   *
   * Misma distribucion que la de ESR Cloud —cuerpo a la izquierda, columna
   * estrecha con totales, estado y acciones a la derecha— usando el mismo
   * vocabulario de `@esr/config/theme.css`: `.detail-layout`, `.info-row`,
   * `.total-row`, `.catalog-list`. Lo que hay aqui abajo en `<style>` son solo
   * las compensaciones de cascada y lo que de verdad es propio de esta
   * pantalla.
   *
   * Va en sintaxis Svelte CLASICA (`let`, `$:`, `on:`), como el resto de
   * Desktop.
   */

  const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida'];

  // `preload.cjs` solo se lee al arrancar Electron: el HMR no lo recarga. Sin
  // reiniciar, `window.api.quotes` es `undefined` y el guardado fallaria en
  // silencio; con esto dice exactamente que hacer.
  const SIN_PUENTE =
    'Reinicie ESR Pro para activar el guardado de cotizaciones: el puente con la base de datos cambió y no basta con recargar la ventana.';

  const VACIA = {
    id: null,
    client_id: '',
    event_id: null,
    date: new Date().toISOString().split('T')[0],
    validity_days: 15,
    discount: 0,
    tax_amount: 0,
    status: 'borrador',
    notes: '',
    conditions: '50% para reserva. 50% restante antes del evento.'
  };

  let cotizacion = { ...VACIA };
  /** { item_id, package_id, name, code, quantity, price, is_legacy_package } */
  let lineas = [];
  let guardando = false;
  let error = '';
  let mensaje = '';

  /**
   * El id se lee de forma REACTIVA, no en `onMount`.
   *
   * SvelteKit reutiliza el componente cuando solo cambia la query, asi que
   * `onMount` no se vuelve a ejecutar: ir de la cotizacion 4 a la 7 desde el
   * listado dejaba la pantalla mostrando la 4. El guarda `cargadoId` evita
   * recargar en bucle, porque el bloque reactivo se dispara con cualquier
   * cambio del store `page`.
   */
  $: quoteId = $page.url.searchParams.get('id');
  let cargadoId;
  $: if (quoteId !== cargadoId) {
    cargadoId = quoteId;
    cargar(quoteId);
  }

  $: editando = !!cotizacion.id;

  // ── Recalculo natural ────────────────────────────────────────────────────
  //
  // La MISMA funcion que ejecuta el repositorio al guardar. No hay dos
  // algoritmos que puedan divergir, y por eso desaparecio el boton
  // «Recalcular»: el total cambia con la tecla.
  $: lineasConTotal = lineas.map((l) => ({
    ...l,
    total: calculateQuoteLineTotal({ quantity: l.quantity, price: l.price })
  }));
  $: totales = calculateQuoteTotals(lineasConTotal, cotizacion.discount, cotizacion.tax_amount);

  // ── Catalogos ────────────────────────────────────────────────────────────
  let clientes = [];
  let articulos = [];
  let paquetes = [];
  let lineasDePaquete = {}; // { [package_id]: [{ item_id, name, code, quantity, price, is_active }] }
  let eventosDelCliente = [];

  async function cargar(id) {
    if (!window.api?.db) return;
    error = '';
    mensaje = '';

    const [clientesRows, articulosRows, paquetesRows, lineasPaqueteRows] = await Promise.all([
      window.api.db.get(
        'SELECT id, name, phone, document_id FROM clients WHERE is_active = 1 ORDER BY name ASC'
      ),
      window.api.db.get(
        `SELECT i.id, i.name, i.internal_code, i.rental_price, i.available_quantity,
                c.name AS cat_name
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
          WHERE i.is_active = 1
          ORDER BY i.name ASC`
      ),
      window.api.db.get(
        'SELECT id, name, description, suggested_price FROM packages WHERE is_active = 1 ORDER BY name ASC'
      ),
      // Las lineas de TODOS los paquetes en UNA consulta. Paquete a paquete
      // seria una consulta por cada cambio del desplegable.
      window.api.db.get(
        `SELECT pi.package_id, pi.item_id, pi.quantity,
                i.name, i.internal_code AS code, i.rental_price AS price, i.is_active
           FROM package_items pi
           JOIN items i ON i.id = pi.item_id
          ORDER BY i.name ASC`
      )
    ]);

    clientes = clientesRows;
    articulos = articulosRows;
    paquetes = paquetesRows;

    const agrupadas = {};
    for (const fila of lineasPaqueteRows) {
      (agrupadas[fila.package_id] ??= []).push(fila);
    }
    lineasDePaquete = agrupadas;

    if (!id) {
      cotizacion = { ...VACIA };
      lineas = [];
      seleccionCliente = null;
      busquedaCliente = '';
      eventosDelCliente = [];
      return;
    }

    if (!window.api?.quotes) {
      error = SIN_PUENTE;
      return;
    }

    const res = await window.api.quotes.findForEdit(id);
    if (!res?.ok) {
      error = res?.error || 'No se pudo cargar la cotización.';
      return;
    }
    if (!res.data) {
      error = 'Esa cotización ya no existe.';
      return;
    }

    cotizacion = { ...res.data.quote };
    lineas = res.data.items.map((fila) => ({
      item_id: fila.item_id,
      package_id: fila.package_id,
      name: fila.name || 'Sin descripción',
      code: fila.code,
      quantity: Number(fila.quantity) || 0,
      price: Number(fila.price) || 0,
      is_legacy_package: fila.is_legacy_package === 1
    }));

    const cliente = clientes.find((c) => c.id === cotizacion.client_id);
    if (cliente) {
      seleccionCliente = cliente;
      busquedaCliente = cliente.name;
      cargarEventos(cliente.id);
    }
  }

  async function cargarEventos(clientId) {
    eventosDelCliente = await window.api.db.get(
      'SELECT id, name, date FROM events WHERE client_id = ? AND is_active = 1 ORDER BY date DESC',
      [clientId]
    );
  }

  // ── Buscador de cliente ──────────────────────────────────────────────────
  let busquedaCliente = '';
  let clienteEnfocado = false;
  let seleccionCliente = null;

  $: clientesFiltrados = busquedaCliente.trim()
    ? clientes.filter((c) => c.name.toLowerCase().includes(busquedaCliente.toLowerCase()))
    : clientes;

  function elegirCliente(c) {
    seleccionCliente = c;
    cotizacion.client_id = c.id;
    cotizacion.event_id = null;
    busquedaCliente = c.name;
    clienteEnfocado = false;
    cargarEventos(c.id);
  }

  function limpiarCliente() {
    seleccionCliente = null;
    cotizacion.client_id = '';
    cotizacion.event_id = null;
    busquedaCliente = '';
    eventosDelCliente = [];
  }

  // ── Lineas ───────────────────────────────────────────────────────────────
  function quitarLinea(indice) {
    lineas = lineas.filter((_, i) => i !== indice);
  }

  // ── Dialogo: agregar articulo ────────────────────────────────────────────
  //
  // NO se cierra al agregar, y lleva un contador en el pie: el catalogo que
  // sustituye permitia agregar cinco cosas seguidas y esa ergonomia se conserva.
  let agregandoArticulo = false;
  let busqueda = '';
  let seleccion = null;
  let alta = { quantity: 1, price: 0 };
  let agregados = 0;

  $: resultados = (() => {
    const t = busqueda.trim().toLowerCase();
    const lista = t
      ? articulos.filter(
          (a) =>
            a.name.toLowerCase().includes(t) ||
            (a.internal_code || '').toLowerCase().includes(t) ||
            (a.cat_name || '').toLowerCase().includes(t)
        )
      : articulos;
    // Sin tope, el {#each} montaria una fila por articulo del catalogo dentro
    // de una caja de 15rem.
    return lista.slice(0, 60);
  })();

  function abrirArticulo() {
    busqueda = '';
    seleccion = null;
    alta = { quantity: 1, price: 0 };
    agregados = 0;
    agregandoArticulo = true;
  }

  function elegirArticulo(articulo) {
    seleccion = articulo;
    alta = { quantity: 1, price: Number(articulo.rental_price) || 0 };
  }

  function confirmarArticulo() {
    if (!seleccion) return;
    lineas = [
      ...lineas,
      {
        item_id: seleccion.id,
        package_id: null,
        name: seleccion.name,
        code: seleccion.internal_code,
        quantity: Number(alta.quantity) || 1,
        price: Number(alta.price) || 0,
        is_legacy_package: false
      }
    ];
    agregados += 1;
    seleccion = null;
    alta = { quantity: 1, price: 0 };
  }

  // ── Dialogo: agregar paquete ─────────────────────────────────────────────
  //
  // El paquete se EXPLOTA en lineas de articulo con el precio vigente de cada
  // uno, que es el modelo de Cloud. Despues se editan como cualquier otra.
  let agregandoPaquete = false;
  let paqueteElegido = '';

  $: previa = (lineasDePaquete[paqueteElegido] ?? []).map((l) => ({
    item_id: l.item_id,
    package_id: null,
    name: l.name,
    code: l.code,
    quantity: Number(l.quantity) || 0,
    price: Number(l.price) || 0,
    is_legacy_package: false,
    is_active: Number(l.is_active)
  }));
  $: totalPrevia = previa.reduce((s, l) => s + calculateQuoteLineTotal(l), 0);
  $: previaConBajas = previa.some((l) => l.is_active !== 1);

  function abrirPaquete() {
    paqueteElegido = '';
    agregandoPaquete = true;
  }

  function confirmarPaquete() {
    if (!previa.length || previaConBajas) return;
    lineas = [...lineas, ...previa.map(({ is_active, ...linea }) => linea)];
    agregandoPaquete = false;
  }

  // ── Dialogo: desglosar una linea heredada ────────────────────────────────
  //
  // Las lineas de paquete heredadas NO se migran: reescribir el importe de un
  // documento ya enviado al cliente no es aceptable. Se ofrece desglosarlas, se
  // enseña el importe de antes y el de despues —a precio de hoy— y no se
  // escribe nada hasta que el usuario pulse «Guardar».
  // `Modal` cierra poniendo su propia `show` a false y NO emite ningun evento,
  // asi que la bandera va aparte del dato: con `show={!!desglosando}` el
  // dialogo se reabriria en cuanto Svelte volviera a evaluar la expresion.
  let desglosando = false;
  let desgloseIndice = -1;
  let desgloseLinea = null;

  $: desglose = desgloseLinea
    ? (lineasDePaquete[desgloseLinea.package_id] ?? []).map((l) => ({
        item_id: l.item_id,
        package_id: null,
        name: l.name,
        code: l.code,
        quantity: (Number(l.quantity) || 0) * (Number(desgloseLinea.quantity) || 1),
        price: Number(l.price) || 0,
        is_legacy_package: false
      }))
    : [];
  $: totalDesglose = desglose.reduce((s, l) => s + calculateQuoteLineTotal(l), 0);
  $: totalAntes = desgloseLinea ? calculateQuoteLineTotal(desgloseLinea) : 0;

  function abrirDesglose(indice) {
    desgloseIndice = indice;
    desgloseLinea = lineas[indice];
    desglosando = true;
  }

  function confirmarDesglose() {
    if (!desglose.length) return;
    lineas = [
      ...lineas.slice(0, desgloseIndice),
      ...desglose,
      ...lineas.slice(desgloseIndice + 1)
    ];
    desglosando = false;
  }

  // ── PDF ──────────────────────────────────────────────────────────────────
  let verPdf = false;
  let pdfUrl = '';
  let pdfNombre = '';

  async function abrirPdf() {
    if (!validateQuoteInput(cotizacion).valid) {
      error = 'Seleccione un cliente antes de generar el documento.';
      return;
    }
    error = '';
    const cliente = seleccionCliente ?? { name: busquedaCliente };
    const empresa = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const datos = {
      ...cotizacion,
      subtotal: totales.subtotal,
      discount: totales.discount,
      tax_amount: totales.tax_amount,
      total: totales.total,
      client_name: cliente.name,
      client_document: cliente.document_id,
      client_phone: cliente.phone
    };
    const { url, filename } = generateQuotationPDF(datos, lineasConTotal, 'preview', empresa);
    pdfUrl = url;
    pdfNombre = filename;
    verPdf = true;
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function guardar() {
    if (!validateQuoteInput(cotizacion).valid) {
      error = 'Seleccione un cliente.';
      return;
    }
    if (!window.api?.quotes) {
      error = SIN_PUENTE;
      return;
    }

    guardando = true;
    error = '';
    mensaje = '';
    try {
      // UNA invocacion, UNA transaccion. Antes eran `UPDATE` + `DELETE` + N
      // `INSERT`, cada uno su propia llamada IPC: si la app se cerraba entre
      // medias quedaba una cotizacion con total y sin lineas.
      const res = await window.api.quotes.save({
        ...cotizacion,
        items: lineas.map((l) => ({
          item_id: l.item_id,
          package_id: l.package_id,
          quantity: l.quantity,
          price: l.price
        }))
      });

      if (!res.ok) {
        error = res.error;
        return;
      }

      cotizacion = { ...res.data.quote };
      lineas = res.data.items.map((fila) => ({
        item_id: fila.item_id,
        package_id: fila.package_id,
        name: fila.name || 'Sin descripción',
        code: fila.code,
        quantity: Number(fila.quantity) || 0,
        price: Number(fila.price) || 0,
        is_legacy_package: fila.is_legacy_package === 1
      }));
      mensaje = 'Cotización guardada.';

      if (!quoteId) {
        // Se queda en la ficha en vez de volver al listado, igual que la de
        // cliente. `cargadoId` se sincroniza a mano para que el bloque reactivo
        // no vuelva a cargar lo que ya tenemos.
        cargadoId = String(cotizacion.id);
        goto(`/quotations/edit?id=${cotizacion.id}`, { replaceState: true, noScroll: true });
      }
    } finally {
      guardando = false;
    }
  }
</script>

<div class="record-header">
  <div class="record-titulo">
    <button class="btn btn-secondary btn-sm" on:click={() => goto('/quotations')}>
      ← Cotizaciones
    </button>
    <h1>
      {editando ? `Cotización #${String(cotizacion.id).padStart(5, '0')}` : 'Nueva cotización'}
    </h1>
    {#if editando}
      <span class="badge {statusBadgeClass(cotizacion.status)}">
        {statusLabel(cotizacion.status)}
      </span>
    {/if}
  </div>

  <div class="record-acciones">
    {#if editando}
      <button class="btn btn-secondary" on:click={abrirPdf}>Vista previa PDF</button>
    {/if}
    <button class="btn btn-primary" on:click={guardar} disabled={guardando}>
      {guardando ? 'Guardando…' : 'Guardar'}
    </button>
  </div>
</div>

{#if error}<div class="alert alert-danger">{error}</div>{/if}
{#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}

<div class="detail-layout">
  <div class="detail-main">
    <!-- ── Informacion general ──────────────────────────────────────────── -->
    <div class="card">
      <div class="card-header"><div class="card-title">Información general</div></div>

      <div class="form-grid">
        <div class="form-field full">
          <label for="cot-cliente">Cliente *</label>
          <div class="combo">
            <input
              id="cot-cliente"
              type="text"
              placeholder="Buscar cliente por nombre…"
              bind:value={busquedaCliente}
              on:focus={() => (clienteEnfocado = true)}
              on:blur={() => setTimeout(() => (clienteEnfocado = false), 180)}
            />
            {#if seleccionCliente}
              <button class="combo-limpiar" on:click={limpiarCliente} title="Limpiar">✕</button>
            {/if}
            {#if clienteEnfocado && clientesFiltrados.length}
              <div class="combo-lista">
                {#each clientesFiltrados.slice(0, 8) as c (c.id)}
                  <button
                    class="catalog-item"
                    class:catalog-item--added={c.id === cotizacion.client_id}
                    on:mousedown={() => elegirCliente(c)}
                  >
                    <span>{c.name}</span>
                    {#if c.phone}<span class="catalog-item-meta">{c.phone}</span>{/if}
                  </button>
                {/each}
                {#if clientesFiltrados.length > 8}
                  <div class="combo-mas">+{clientesFiltrados.length - 8} más…</div>
                {/if}
              </div>
            {/if}
          </div>
        </div>

        <div class="form-field">
          <label for="cot-evento">Evento vinculado</label>
          <select id="cot-evento" bind:value={cotizacion.event_id} disabled={!cotizacion.client_id}>
            <option value={null}>(Ninguno)</option>
            {#each eventosDelCliente as ev (ev.id)}
              <option value={ev.id}>{ev.name} — {ev.date}</option>
            {/each}
          </select>
        </div>

        <div class="form-field">
          <label for="cot-fecha">Fecha</label>
          <input id="cot-fecha" type="date" bind:value={cotizacion.date} />
        </div>

        <div class="form-field">
          <label for="cot-validez">Validez (días)</label>
          <input id="cot-validez" type="number" min="1" bind:value={cotizacion.validity_days} />
        </div>

        <div class="form-field full">
          <label for="cot-notas">Observaciones internas</label>
          <textarea id="cot-notas" rows="2" bind:value={cotizacion.notes}></textarea>
        </div>

        <div class="form-field full">
          <label for="cot-condiciones">Condiciones (aparecen en el PDF)</label>
          <textarea id="cot-condiciones" rows="3" bind:value={cotizacion.conditions}></textarea>
        </div>
      </div>
    </div>

    <!-- ── Lineas ───────────────────────────────────────────────────────── -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Ítems cotizados</div>
        <div class="card-acciones">
          <button class="btn btn-secondary btn-sm" on:click={abrirArticulo}>Agregar artículo</button>
          <button class="btn btn-secondary btn-sm" on:click={abrirPaquete}>Agregar paquete</button>
        </div>
      </div>

      {#if lineas.length === 0}
        <p class="empty-state">Aún no hay ítems. Agregue un artículo o un paquete.</p>
      {:else}
        <table class="table tabla-lineas">
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Código</th>
              <th class="num">Cant.</th>
              <th class="num">Precio</th>
              <th class="num">Importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each lineas as linea, i}
              <tr class:linea-heredada={linea.is_legacy_package}>
                <td>
                  {quoteItemLabel(linea)}
                  {#if linea.is_legacy_package}
                    <button class="btn-desglosar" on:click={() => abrirDesglose(i)}>
                      Desglosar
                    </button>
                  {/if}
                </td>
                <td>{linea.code || '—'}</td>
                <td class="num">
                  <input type="number" min="0" bind:value={linea.quantity} aria-label="Cantidad" />
                </td>
                <td class="num">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    bind:value={linea.price}
                    aria-label="Precio"
                  />
                </td>
                <td class="num importe">
                  {formatMoney(calculateQuoteLineTotal(linea))}
                </td>
                <td>
                  <button class="btn-quitar" on:click={() => quitarLinea(i)}>Quitar</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

  <div class="detail-side">
    <!-- ── Totales ──────────────────────────────────────────────────────── -->
    <div class="card">
      <div class="card-header"><div class="card-title">Totales</div></div>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>{formatMoney(totales.subtotal)}</span>
        </div>
        <div class="total-row">
          <label for="cot-descuento">Descuento</label>
          <input
            id="cot-descuento"
            type="number"
            min="0"
            step="0.01"
            bind:value={cotizacion.discount}
          />
        </div>
        <div class="total-row">
          <label for="cot-impuesto">Impuesto</label>
          <input
            id="cot-impuesto"
            type="number"
            min="0"
            step="0.01"
            bind:value={cotizacion.tax_amount}
          />
        </div>
        <div class="total-row total-row--final">
          <span>Total</span>
          <span>{formatMoney(totales.total)}</span>
        </div>
      </div>

      <p class="panel-hint ayuda">
        Descuento e impuesto son importes, no porcentajes.
      </p>
    </div>

    <!-- ── Estado ───────────────────────────────────────────────────────── -->
    <div class="card">
      <div class="card-header"><div class="card-title">Estado</div></div>
      <!-- Envuelto en `.form-grid` aunque sea UN campo: en theme.css el estilo
           de los controles cuelga de `.form-grid input/select/textarea`, no de
           `.form-field`. Un campo suelto sale con el `<select>` nativo. -->
      <div class="form-grid">
        <div class="form-field">
          <label for="cot-estado">Estado de la cotización</label>
          <select id="cot-estado" bind:value={cotizacion.status}>
            {#each ESTADOS as estado}
              <option value={estado}>{statusLabel(estado)}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <!-- ── Acciones ─────────────────────────────────────────────────────── -->
    <div class="card">
      <div class="card-header"><div class="card-title">Acciones</div></div>
      <button class="btn btn-secondary bloque" on:click={() => goto('/quotations')}>
        ← Volver a la lista
      </button>
    </div>
  </div>
</div>

<!-- ── Dialogo: agregar articulo ───────────────────────────────────────── -->
<Modal bind:show={agregandoArticulo} title="Agregar artículo" maxWidth="560px">
  <div class="form-grid">
    <div class="form-field">
      <label for="alta-buscar">Buscar</label>
      <input
        id="alta-buscar"
        type="text"
        placeholder="Nombre, código o categoría"
        bind:value={busqueda}
      />
    </div>
  </div>

  <div class="catalog-list">
    {#each resultados as articulo (articulo.id)}
      <button
        class="catalog-item"
        class:catalog-item--added={seleccion?.id === articulo.id}
        on:click={() => elegirArticulo(articulo)}
      >
        <span>{articulo.name}</span>
        <span class="catalog-item-meta">
          <span>{articulo.internal_code || '—'}</span>
          <span>Disp. {articulo.available_quantity ?? 0}</span>
          <span>{formatMoney(articulo.rental_price)}</span>
        </span>
      </button>
    {:else}
      <p class="empty-state">Sin resultados.</p>
    {/each}
  </div>

  <div class="form-grid alta-campos">
    <div class="form-field">
      <label for="alta-cantidad">Cantidad</label>
      <input id="alta-cantidad" type="number" min="1" bind:value={alta.quantity} />
    </div>
    <div class="form-field">
      <label for="alta-precio">Precio unitario</label>
      <input id="alta-precio" type="number" min="0" step="0.01" bind:value={alta.price} />
    </div>
  </div>

  <p class="panel-hint ayuda">
    Importe: {formatMoney((Number(alta.quantity) || 0) * (Number(alta.price) || 0))}
  </p>

  <svelte:fragment slot="footer">
    <span class="contador">
      {agregados === 0 ? 'Sin líneas agregadas' : `${agregados} línea(s) agregada(s)`}
    </span>
    <button class="btn btn-secondary" on:click={() => (agregandoArticulo = false)}>Cerrar</button>
    <button class="btn btn-primary" on:click={confirmarArticulo} disabled={!seleccion}>
      Agregar
    </button>
  </svelte:fragment>
</Modal>

<!-- ── Dialogo: agregar paquete ────────────────────────────────────────── -->
<Modal bind:show={agregandoPaquete} title="Agregar paquete" maxWidth="640px">
  <div class="form-grid">
    <div class="form-field">
      <label for="paq-select">Paquete</label>
      <select id="paq-select" bind:value={paqueteElegido}>
        <option value="">Elija el paquete</option>
        {#each paquetes as p (p.id)}
          <option value={p.id}>
            {p.name} ({(lineasDePaquete[p.id] ?? []).length} artículo(s))
          </option>
        {/each}
      </select>
    </div>
  </div>

  {#if paqueteElegido}
    <p class="panel-hint">
      Se insertarán {previa.length} línea(s) sueltas con el precio vigente de cada artículo.
      Después se editan como cualquier otra.
    </p>

    <table class="table tabla-previa">
      <thead>
        <tr>
          <th>Artículo</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Importe</th>
        </tr>
      </thead>
      <tbody>
        {#each previa as l (l.item_id)}
          <tr>
            <td>
              {l.name}
              {#if l.is_active !== 1}<span class="badge badge-danger">Dado de baja</span>{/if}
            </td>
            <td class="num">{l.quantity}</td>
            <td class="num">{formatMoney(l.price)}</td>
            <td class="num">{formatMoney(calculateQuoteLineTotal(l))}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="total-row total-row--final">
      <span>Añade al subtotal</span>
      <span>{formatMoney(totalPrevia)}</span>
    </div>

    {#if previaConBajas}
      <p class="alert alert-danger">
        El paquete tiene artículos dados de baja. Corrija el paquete en Configuración antes de
        insertarlo.
      </p>
    {/if}
  {/if}

  <svelte:fragment slot="footer">
    <button class="btn btn-secondary" on:click={() => (agregandoPaquete = false)}>Cancelar</button>
    <button
      class="btn btn-primary"
      on:click={confirmarPaquete}
      disabled={!previa.length || previaConBajas}
    >
      Insertar {previa.length} línea(s)
    </button>
  </svelte:fragment>
</Modal>

<!-- ── Dialogo: desglosar ──────────────────────────────────────────────── -->
<Modal bind:show={desglosando} title="Desglosar paquete" maxWidth="640px">
  {#if desgloseLinea}
    <p class="panel-hint">
      La línea de paquete se sustituye por sus artículos, con el precio de hoy. No se escribe nada
      hasta que pulse «Guardar».
    </p>

    {#if desglose.length === 0}
      <p class="empty-state">Ese paquete ya no tiene artículos. No hay nada que desglosar.</p>
    {:else}
      <table class="table tabla-previa">
        <thead>
          <tr>
            <th>Artículo</th>
            <th class="num">Cant.</th>
            <th class="num">Precio</th>
            <th class="num">Importe</th>
          </tr>
        </thead>
        <tbody>
          {#each desglose as l (l.item_id)}
            <tr>
              <td>{l.name}</td>
              <td class="num">{l.quantity}</td>
              <td class="num">{formatMoney(l.price)}</td>
              <td class="num">{formatMoney(calculateQuoteLineTotal(l))}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="total-row">
        <span>Importe actual de la línea</span>
        <span>{formatMoney(totalAntes)}</span>
      </div>
      <div class="total-row total-row--final">
        <span>Importe desglosado</span>
        <span>{formatMoney(totalDesglose)}</span>
      </div>
    {/if}
  {/if}

  <svelte:fragment slot="footer">
    <button class="btn btn-secondary" on:click={() => (desglosando = false)}>Cancelar</button>
    <button class="btn btn-primary" on:click={confirmarDesglose} disabled={!desglose.length}>
      Desglosar
    </button>
  </svelte:fragment>
</Modal>

<PdfPreviewModal
  bind:show={verPdf}
  pdfUrl={pdfUrl}
  filename={pdfNombre}
  title="Vista previa de cotización"
/>

<style>
  /* ── Compensaciones de cascada ──────────────────────────────────────────
     `app.css` de Desktop va SIN capa y gana a `theme.css` pase lo que pase.
     Estas dos reglas neutralizan ese delta dentro de la ficha; no hay ninguna
     otra redefinicion aqui, que es justo lo que separaba a las dos apps. */
  .detail-layout .card {
    /* `app.css:182` pone `margin-bottom: var(--sp-5)` a toda `.card`, y aqui
       la separacion la da el `gap` de la columna. */
    margin-bottom: 0;
  }

  .card-header .card-title {
    /* `app.css:187` pone `margin-bottom: 15px` a `.card-title`, que sumaria al
       margen del propio `.card-header`. */
    margin-bottom: 0;
  }

  /* ── Cabecera del registro ───────────────────────────────────────────── */
  .record-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .record-titulo,
  .record-acciones,
  .card-acciones {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .record-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  /* ── Combobox de cliente ─────────────────────────────────────────────── */
  .combo {
    position: relative;
  }

  .combo-limpiar {
    position: absolute;
    top: 50%;
    right: var(--sp-2);
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: inherit;
  }

  .combo-lista {
    position: absolute;
    z-index: 20;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 15rem;
    overflow-y: auto;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    box-shadow: var(--shadow-md);
  }

  .combo-mas {
    padding: var(--sp-2) var(--sp-3);
    background: var(--bg-surface);
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  /* ── Tablas ──────────────────────────────────────────────────────────── */
  .num {
    text-align: right;
  }

  .importe {
    font-weight: 600;
    white-space: nowrap;
  }

  .tabla-lineas input {
    width: 5rem;
    padding: var(--sp-1) var(--sp-2);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--font-sm);
    text-align: right;
  }

  /* Bloque marcado y no un simple color de fondo: una linea heredada se
     comporta distinto —no se puede editar por articulo— y hay que verlo. */
  .linea-heredada {
    background: var(--warning-bg);
  }

  .btn-desglosar,
  .btn-quitar {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: var(--font-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-desglosar {
    margin-left: var(--sp-2);
    color: var(--warning-text);
  }

  .btn-quitar {
    color: var(--danger-text);
  }

  .tabla-previa {
    margin-bottom: var(--sp-3);
  }

  /* ── Varios ──────────────────────────────────────────────────────────── */
  .ayuda {
    margin: var(--sp-3) 0 0;
  }

  .alta-campos {
    margin-top: var(--sp-4);
  }

  .bloque {
    width: 100%;
  }

  /* El contador empuja los botones del pie a la derecha. */
  .contador {
    margin-right: auto;
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }
</style>
