<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fmt } from '@esr/reports';
  import { FormattedNumberField, Icon, Modal, SearchPicker } from '@esr/ui';
  import { unwrap, unwrapOr } from '$lib/ipc';
  import { dangerModal } from '$lib/stores/dangerModal.js';

  /**
   * Facturar dejo de exigir una orden: hay tres origenes -orden, cotización
   * facturada directo y por partes, o ninguno de los dos, factura libre-.
   * Mismo diseño que Cloud, con el mecanismo propio de Desktop: sin
   * `load`/acciones de formulario, la orden/cotización elegida se lee de la
   * URL (`?wo=`/`?quote=`) de forma REACTIVA -igual que ya hacia esta
   * pantalla antes de esta reforma- y los datos se piden por IPC.
   */
  let origen = '';

  let workOrderId = null;
  let quotationId = null;

  // ── Catalogos (una sola vez) ────────────────────────────────────────────
  let clients = [];
  let allItems = [];
  let allServices = [];

  // ── Origen Orden ──────────────────────────────────────────────────────────
  let orders = [];
  let conduces = [];
  let serviciosOrden = [];
  let seleccion = new Set();
  let seleccionServicios = new Set();

  /**
   * El dia que se instala el modulo, TODAS las entregas historicas aparecen
   * como pendientes —incluidas las ya cobradas fuera del sistema—. Por
   * defecto se muestran las de los ultimos meses; el resto, bajo peticion.
   */
  let soloRecientes = true;
  const DIAS_RECIENTES = 90;

  function desde() {
    const d = new Date();
    d.setDate(d.getDate() - DIAS_RECIENTES);
    return d.toISOString().slice(0, 10);
  }

  // ── Origen Cotización ─────────────────────────────────────────────────────
  let quotes = [];
  let clienteFiltroCotizacion = null;
  let lineasQuote = [];

  $: cotizacionesFiltradas = clienteFiltroCotizacion
    ? quotes.filter((q) => String(q.client_id) === String(clienteFiltroCotizacion.id))
    : quotes;

  function alternarLineaQuote(linea) {
    linea.on = !linea.on;
    lineasQuote = [...lineasQuote];
  }

  function limitarCantidad(linea) {
    const max = Number(linea.remaining);
    let n = Number(linea.cantidad) || 0;
    if (n > max) n = max;
    if (n < 0) n = 0;
    linea.cantidad = n;
    lineasQuote = [...lineasQuote];
  }

  // ── Origen Directa ────────────────────────────────────────────────────────
  let clienteDirecta = null;
  let siguienteUid = 1;
  /** `{ uid, kind: 'item'|'service'|'manual', ref_id, description, code, quantity, price }` */
  let lineas = [];

  let modalAbierto = false;
  let modalTipo = null;
  let modalBusqueda = '';
  let modalElegido = null;
  let modalCantidad = 1;
  let modalPrecio = 0;
  let modalDescripcion = '';

  const TITULOS_MODAL = { item: 'Agregar artículo', service: 'Agregar servicio', manual: 'Línea manual' };

  function abrirModal(tipo) {
    modalTipo = tipo;
    modalBusqueda = '';
    modalElegido = null;
    modalCantidad = 1;
    modalPrecio = 0;
    modalDescripcion = '';
    modalAbierto = true;
  }

  function cerrarModal() {
    modalAbierto = false;
  }

  function elegirEnModal(catalogo) {
    modalElegido = catalogo;
    modalPrecio = Number(catalogo.rental_price ?? catalogo.price ?? 0);
  }

  function agregarLinea() {
    if (modalTipo === 'manual') {
      if (!modalDescripcion.trim()) return;
      lineas = [
        ...lineas,
        {
          uid: siguienteUid++,
          kind: 'manual',
          ref_id: null,
          description: modalDescripcion.trim(),
          code: null,
          quantity: Number(modalCantidad) || 1,
          price: Number(modalPrecio) || 0
        }
      ];
      cerrarModal();
      return;
    }

    if (!modalElegido) return;

    // Un Articulo repetido se fusiona por id; un Servicio o una linea manual
    // NO -dos actuaciones del mismo servicio no son la misma linea-.
    if (modalTipo === 'item') {
      const existente = lineas.find((l) => l.kind === 'item' && l.ref_id === modalElegido.id);
      if (existente) {
        const cantidadNueva = Number(modalCantidad) || 1;
        lineas = lineas.map((l) =>
          l === existente ? { ...l, quantity: Number(l.quantity) + cantidadNueva } : l
        );
        cerrarModal();
        return;
      }
    }

    lineas = [
      ...lineas,
      {
        uid: siguienteUid++,
        kind: modalTipo,
        ref_id: modalElegido.id,
        description: modalElegido.name,
        code: modalElegido.internal_code ?? null,
        quantity: Number(modalCantidad) || 1,
        price: Number(modalPrecio) || 0
      }
    ];
    cerrarModal();
  }

  function quitarLinea(uid) {
    lineas = lineas.filter((l) => l.uid !== uid);
  }

  $: catalogoModal = modalTipo === 'item' ? allItems : modalTipo === 'service' ? allServices : [];
  $: resultadosModal = !modalBusqueda.trim()
    ? catalogoModal
    : catalogoModal.filter((c) => c.name.toLowerCase().includes(modalBusqueda.toLowerCase()));

  // ── Pie común ─────────────────────────────────────────────────────────────
  let fecha = new Date().toISOString().slice(0, 10);
  let vencimiento = '';
  let descuento = 0;
  let impuesto = 0;
  let notas = '';

  let cargando = false;
  let guardando = false;

  function hayAlgoQuePerder() {
    return (
      seleccion.size > 0 ||
      seleccionServicios.size > 0 ||
      lineasQuote.some((l) => l.on) ||
      lineas.length > 0 ||
      !!clienteDirecta
    );
  }

  function elegirOrigenCard(nuevo) {
    if (origen === nuevo) return;
    if (workOrderId || quotationId || hayAlgoQuePerder()) {
      if (!confirm('Se perderán las líneas elegidas. ¿Cambiar el origen de la factura?')) return;
      goto('/invoices/new');
      return;
    }
    origen = nuevo;
  }

  function cambiarOrigen() {
    if (hayAlgoQuePerder() && !confirm('Se perderán las líneas elegidas. ¿Cambiar el origen de la factura?')) {
      return;
    }
    goto('/invoices/new');
  }

  // Catalogos de una sola vez: clientes, articulos y servicios.
  onMount(async () => {
    clients = await window.api.db.get(
      'SELECT id, name, phone, document_id FROM clients WHERE is_active = 1 ORDER BY name'
    );
    allItems = await window.api.db.get(
      'SELECT id, name, internal_code, rental_price FROM items WHERE is_active = 1 ORDER BY name'
    );
    allServices = await window.api.db.get(
      'SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name'
    );
  });

  /**
   * La orden/cotizacion se lee de la URL de forma REACTIVA, no en `onMount`.
   *
   * Al pasar de `/invoices/new` a `/invoices/new?wo=7` SvelteKit reutiliza el
   * componente —es la misma ruta— y `onMount` no vuelve a ejecutarse.
   * `ultimaClave` evita recargar cuando cambia cualquier otra cosa de `$page`.
   */
  let ultimaClave = null;

  $: parametros = $page.url.searchParams;
  $: clave = `${parametros.get('wo') || ''}|${parametros.get('quote') || ''}`;
  $: if (typeof window !== 'undefined' && clave !== ultimaClave) {
    ultimaClave = clave;
    workOrderId = parametros.get('wo') ? Number(parametros.get('wo')) : null;
    quotationId = parametros.get('quote') ? Number(parametros.get('quote')) : null;
    if (workOrderId) origen = 'orden';
    else if (quotationId) origen = 'cotizacion';
    cargar();
  }

  async function cargar() {
    cargando = true;
    try {
      if (workOrderId) {
        conduces = unwrap(await window.api.invoices.listBillable(workOrderId));
        serviciosOrden = unwrap(await window.api.invoices.listBillableServices(workOrderId));
        seleccion = new Set(conduces.map((c) => c.id));
        seleccionServicios = new Set(serviciosOrden.map((s) => s.id));
      } else if (quotationId) {
        const pendientes = unwrap(await window.api.invoices.listBillableQuotationItems(quotationId));
        lineasQuote = pendientes.map((l) => ({ ...l, on: true, cantidad: Number(l.remaining) }));
      } else {
        orders = unwrapOr(
          await window.api.invoices.listOrdersWithBillable(soloRecientes ? { since: desde() } : {}),
          []
        );
        quotes = unwrapOr(
          await window.api.invoices.listQuotationsWithBillable(soloRecientes ? { since: desde() } : {}),
          []
        );
        conduces = [];
        serviciosOrden = [];
        seleccion = new Set();
        seleccionServicios = new Set();
        lineasQuote = [];
      }
    } catch (err) {
      dangerModal.show(err.message);
    } finally {
      cargando = false;
    }
  }

  function alternar(id) {
    const copia = new Set(seleccion);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    seleccion = copia;
  }

  function alternarServicio(id) {
    const copia = new Set(seleccionServicios);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    seleccionServicios = copia;
  }

  $: subtotal =
    origen === 'orden'
      ? conduces.filter((c) => seleccion.has(c.id)).reduce((s, c) => s + Number(c.total || 0), 0) +
        serviciosOrden
          .filter((s) => seleccionServicios.has(s.id))
          .reduce((s, x) => s + Number(x.quantity || 0) * Number(x.price || 0), 0)
      : origen === 'cotizacion'
        ? lineasQuote.filter((l) => l.on).reduce((s, l) => s + Number(l.cantidad || 0) * Number(l.price || 0), 0)
        : lineas.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.price || 0), 0);
  $: rebaja = Math.max(0, Number(descuento) || 0);
  $: impuestoNum = Math.max(0, Number(impuesto) || 0);
  $: total = Math.max(0, subtotal - rebaja + impuestoNum);
  $: excede = rebaja > subtotal;
  $: nElegidas =
    origen === 'orden'
      ? seleccion.size + seleccionServicios.size
      : origen === 'cotizacion'
        ? lineasQuote.filter((l) => l.on && Number(l.cantidad) > 0).length
        : lineas.length;
  $: puedeEmitir =
    !excede &&
    ((origen === 'orden' && !!workOrderId && nElegidas > 0) ||
      (origen === 'cotizacion' && !!quotationId && nElegidas > 0) ||
      (origen === 'directa' && !!clienteDirecta && nElegidas > 0));

  async function emitir() {
    if (guardando || !puedeEmitir) return;
    guardando = true;
    try {
      let source;
      if (origen === 'orden') {
        source = {
          kind: 'work_order',
          work_order_id: workOrderId,
          conduce_ids: [...seleccion],
          service_line_ids: [...seleccionServicios]
        };
      } else if (origen === 'cotizacion') {
        source = {
          kind: 'quotation',
          quotation_id: quotationId,
          lines: lineasQuote
            .filter((l) => l.on && Number(l.cantidad) > 0)
            .map((l) => ({ quotation_item_id: l.id, quantity: l.cantidad }))
        };
      } else {
        source = {
          kind: 'free',
          client_id: clienteDirecta.id,
          lines: lineas.map((l) => ({
            item_id: l.kind === 'item' ? l.ref_id : null,
            service_id: l.kind === 'service' ? l.ref_id : null,
            description: l.kind === 'manual' ? l.description : null,
            quantity: l.quantity,
            price: l.price
          }))
        };
      }

      const factura = unwrap(
        await window.api.invoices.create({
          source,
          date: fecha || null,
          due_date: vencimiento || null,
          discount: rebaja,
          tax_amount: impuestoNum,
          notes: notas || null
        })
      );
      goto(`/invoices/detail?id=${factura.id}`);
    } catch (err) {
      dangerModal.show(err.message);
      // Si otra emision se llevo algo pendiente, la lista en pantalla ya no vale.
      await cargar();
    } finally {
      guardando = false;
    }
  }
</script>

<div class="card">
  <div class="card-title">
    <span>Nueva factura</span>
    <button class="btn btn-secondary" on:click={() => goto('/invoices')}>← Volver</button>
  </div>

  <fieldset class="origen" class:origen--compacta={!!origen}>
    <legend class="origen-legend">¿De dónde sale esta factura?</legend>
    <div class="origen-opciones">
      <label class="origen-card" class:origen-card--on={origen === 'orden'}>
        <input
          class="origen-radio"
          type="radio"
          name="origen_ui"
          value="orden"
          checked={origen === 'orden'}
          on:change={() => elegirOrigenCard('orden')}
        />
        <span class="origen-icono"><Icon name="clipboard" size={22} /></span>
        <span class="origen-texto">
          <span class="origen-nombre">Desde una orden</span>
          <span class="origen-desc">Cobrar entregas y servicios ya realizados.</span>
        </span>
        <span class="origen-check" aria-hidden="true"><Icon name="check" size={16} /></span>
      </label>
      <label class="origen-card" class:origen-card--on={origen === 'cotizacion'}>
        <input
          class="origen-radio"
          type="radio"
          name="origen_ui"
          value="cotizacion"
          checked={origen === 'cotizacion'}
          on:change={() => elegirOrigenCard('cotizacion')}
        />
        <span class="origen-icono"><Icon name="fileText" size={22} /></span>
        <span class="origen-texto">
          <span class="origen-nombre">Desde una cotización</span>
          <span class="origen-desc">Facturar las líneas aprobadas, todas o una parte.</span>
        </span>
        <span class="origen-check" aria-hidden="true"><Icon name="check" size={16} /></span>
      </label>
      <label class="origen-card" class:origen-card--on={origen === 'directa'}>
        <input
          class="origen-radio"
          type="radio"
          name="origen_ui"
          value="directa"
          checked={origen === 'directa'}
          on:change={() => elegirOrigenCard('directa')}
        />
        <span class="origen-icono"><Icon name="penLine" size={22} /></span>
        <span class="origen-texto">
          <span class="origen-nombre">Factura directa</span>
          <span class="origen-desc">Elija el cliente y escriba las líneas.</span>
        </span>
        <span class="origen-check" aria-hidden="true"><Icon name="check" size={16} /></span>
      </label>
    </div>
    {#if origen}
      <button type="button" class="btn-link" on:click={cambiarOrigen}>Cambiar origen</button>
    {/if}
  </fieldset>

  {#if cargando}
    <p style="color:var(--text-muted);margin-top:16px;">Cargando…</p>
  {:else if origen}
    <div class="detail-layout" style="margin-top:16px;">
      <div class="detail-main">
        {#if origen === 'orden'}
          {#if !workOrderId}
            <p class="panel-hint">Elija la orden cuyas entregas o servicios quiere cobrar.</p>
            <label class="casilla">
              <input type="checkbox" bind:checked={soloRecientes} on:change={cargar} />
              <span>Solo entregas de los últimos {DIAS_RECIENTES} días</span>
            </label>
            {#if orders.length === 0}
              <p class="empty-state">No hay órdenes con algo pendiente de facturar.</p>
            {:else}
              <ul class="pick-list">
                {#each orders as orden}
                  <li>
                    <button
                      type="button"
                      class="pick-item pick-item--boton"
                      on:click={() => goto(`/invoices/new?wo=${orden.id}`)}
                    >
                      <span></span>
                      <span class="pick-item-cuerpo">
                        <span class="pick-item-titulo">WO-{String(orden.id).padStart(5, '0')}</span>
                        <span class="pick-item-meta">{orden.client_name || '—'} · {orden.pendientes} pendiente(s)</span>
                      </span>
                      <span class="pick-item-importe">${fmt(orden.total_pendiente)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          {:else if conduces.length === 0 && serviciosOrden.length === 0}
            <p class="empty-state">
              La orden WO-{String(workOrderId).padStart(5, '0')} no tiene nada pendiente de facturar.
            </p>
          {:else}
            {#if conduces.length > 0}
              <h4 class="titulo-seccion">Entregas de WO-{String(workOrderId).padStart(5, '0')}</h4>
              <ul class="pick-list">
                {#each conduces as conduce}
                  {@const marcada = seleccion.has(conduce.id)}
                  <li>
                    <label class="pick-item" class:pick-item--on={marcada}>
                      <input
                        type="checkbox"
                        checked={marcada}
                        on:change={() => alternar(conduce.id)}
                        aria-label={`Incluir COND-${String(conduce.id).padStart(5, '0')}`}
                      />
                      <span class="pick-item-cuerpo">
                        <span class="pick-item-titulo">COND-{String(conduce.id).padStart(5, '0')}</span>
                        <span class="pick-item-meta">{conduce.date || '—'} · {conduce.lineas} línea(s)</span>
                      </span>
                      <span class="pick-item-importe">${fmt(conduce.total)}</span>
                    </label>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if serviciosOrden.length > 0}
              <h4 class="titulo-seccion" style="margin-top:16px;">Servicios pendientes de facturar</h4>
              <ul class="pick-list">
                {#each serviciosOrden as servicio}
                  {@const marcada = seleccionServicios.has(servicio.id)}
                  <li>
                    <label class="pick-item" class:pick-item--on={marcada}>
                      <input
                        type="checkbox"
                        checked={marcada}
                        on:change={() => alternarServicio(servicio.id)}
                        aria-label={`Incluir ${servicio.name}`}
                      />
                      <span class="pick-item-cuerpo">
                        <span class="pick-item-titulo">{servicio.name}</span>
                        <span class="pick-item-meta">Cantidad {servicio.quantity} · ${fmt(servicio.price)} c/u</span>
                      </span>
                      <span class="pick-item-importe">${fmt(Number(servicio.quantity) * Number(servicio.price))}</span>
                    </label>
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        {:else if origen === 'cotizacion'}
          {#if !quotationId}
            <p class="panel-hint">
              Se puede facturar una parte ahora y el resto más adelante; la cotización sigue
              convertible a orden por lo que quede.
            </p>
            <div class="info-row">
              <div class="field">
                <SearchPicker
                  label="Cliente"
                  icon="user"
                  placeholder="Filtrar por cliente…"
                  items={clients}
                  bind:value={clienteFiltroCotizacion}
                  getMain={(c) => c.name}
                  getSub={(c) => c.phone || ''}
                />
              </div>
              <div class="field">
                <SearchPicker
                  label="Cotización"
                  icon="fileText"
                  placeholder="Buscar por número…"
                  items={cotizacionesFiltradas}
                  getKey={(q) => q.id}
                  getMain={(q) => q.quote_number || `#${q.id}`}
                  getSub={(q) => q.client_name || ''}
                  getAside={(q) => `$${fmt(q.total_pendiente)}`}
                  onselect={(q) => goto(`/invoices/new?quote=${q.id}`)}
                />
              </div>
            </div>
            {#if quotes.length === 0}
              <p class="empty-state" style="margin-top:12px;">No hay cotizaciones con algo pendiente de facturar.</p>
            {/if}
          {:else}
            <h4 class="titulo-seccion">
              Líneas pendientes de {cotizacionesFiltradas.find((q) => q.id === quotationId)?.quote_number ||
                quotes.find((q) => q.id === quotationId)?.quote_number ||
                `#${quotationId}`}
            </h4>
            <p class="panel-hint">
              Se puede facturar una parte ahora y el resto más adelante; la cotización sigue
              convertible a orden por lo que quede.
            </p>
            {#if lineasQuote.length === 0}
              <p class="empty-state">Esta cotización no tiene nada pendiente de facturar.</p>
            {:else}
              <ul class="pick-list">
                {#each lineasQuote as linea (linea.id)}
                  <li>
                    <label class="pick-item" class:pick-item--on={linea.on}>
                      <input
                        type="checkbox"
                        checked={linea.on}
                        on:change={() => alternarLineaQuote(linea)}
                        aria-label={`Incluir ${linea.name}`}
                      />
                      <span class="pick-item-cuerpo">
                        <span class="pick-item-titulo">{linea.name}</span>
                        <span class="pick-item-meta">
                          Pendiente {linea.remaining} de {linea.quantity} · ${fmt(linea.price)} c/u
                        </span>
                      </span>
                      <span class="pick-item-control">
                        <input
                          type="number"
                          class="cantidad-mini"
                          min="0"
                          max={linea.remaining}
                          step="1"
                          bind:value={linea.cantidad}
                          on:input={() => limitarCantidad(linea)}
                          disabled={!linea.on}
                          aria-label={`Cantidad a facturar de ${linea.name}`}
                        />
                      </span>
                      <span class="pick-item-importe">${fmt(Number(linea.cantidad || 0) * Number(linea.price))}</span>
                    </label>
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        {:else if origen === 'directa'}
          <SearchPicker
            label="Cliente"
            icon="user"
            required
            placeholder="Buscar cliente por nombre…"
            items={clients}
            bind:value={clienteDirecta}
            getMain={(c) => c.name}
            getSub={(c) => [c.document_id, c.phone].filter(Boolean).join(' · ')}
          />

          <div class="card-title" style="margin-top:16px;">
            <span>Líneas de la factura</span>
            <span class="cuenta">{lineas.length}</span>
          </div>

          <div class="agregar-tipos">
            <button type="button" class="tipo-btn" on:click={() => abrirModal('service')}>
              <Icon name="stock" size={18} />Servicio
            </button>
            <button type="button" class="tipo-btn" on:click={() => abrirModal('item')}>
              <Icon name="stock" size={18} />Artículo
            </button>
            <button type="button" class="tipo-btn" on:click={() => abrirModal('manual')}>
              <Icon name="penLine" size={18} />Línea manual
            </button>
          </div>

          {#if lineas.length === 0}
            <p class="empty-state">Agregue un servicio, un artículo del inventario o un cargo libre.</p>
          {:else}
            <ul class="pick-list">
              {#each lineas as linea (linea.uid)}
                <li>
                  <div class="pick-item linea-card">
                    <span class="pick-item-cuerpo">
                      <span class="pick-item-titulo">
                        {linea.description}
                        {#if linea.code}<span class="linea-card-tag">({linea.code})</span>{/if}
                      </span>
                      <span class="pick-item-meta">
                        {linea.kind === 'service' ? 'Servicio' : linea.kind === 'item' ? 'Artículo' : 'Manual'}
                        · {linea.quantity} × ${fmt(linea.price)}
                      </span>
                    </span>
                    <span class="pick-item-importe">${fmt(Number(linea.quantity) * Number(linea.price))}</span>
                    <button type="button" class="btn-icono" on:click={() => quitarLinea(linea.uid)} aria-label="Quitar línea">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>

      <aside class="detail-side">
        <div class="info-row">
          <div class="field">
            <label for="fecha">Fecha</label>
            <input id="fecha" class="form-control" type="date" bind:value={fecha} />
          </div>
          <div class="field">
            <label for="vence">Vencimiento</label>
            <input id="vence" class="form-control" type="date" bind:value={vencimiento} />
          </div>
          <div class="field">
            <label for="desc">Descuento</label>
            <FormattedNumberField id="desc" class="form-control" min={0} bind:value={descuento} />
          </div>
          <div class="field">
            <label for="imp">ITBIS</label>
            <FormattedNumberField id="imp" class="form-control" min={0} bind:value={impuesto} />
          </div>
          <div class="field field-lg">
            <label for="notas">Notas</label>
            <input id="notas" class="form-control" bind:value={notas} />
          </div>
        </div>

        <div class="totals" style="margin-top:16px;">
          <div class="total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
          <div class="total-row"><span>Descuento</span><span>−${fmt(rebaja)}</span></div>
          <div class="total-row"><span>ITBIS</span><span>${fmt(impuestoNum)}</span></div>
          <div class="total-row total-row--final"><span>Total</span><span>${fmt(total)}</span></div>
        </div>

        {#if excede}
          <div class="alert-error" style="margin-top:12px;">El descuento no puede superar el subtotal.</div>
        {/if}

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
          <button class="btn btn-secondary" on:click={() => goto('/invoices')}>
            <Icon name="x" size={16} />Cancelar
          </button>
          <button class="btn btn-primary" disabled={guardando || !puedeEmitir} on:click={emitir}>
            <Icon name="check" size={16} />{guardando ? 'Emitiendo…' : 'Emitir factura'}
          </button>
        </div>
      </aside>
    </div>
  {/if}
</div>

<Modal bind:show={modalAbierto} title={modalTipo ? TITULOS_MODAL[modalTipo] : ''} maxWidth="480px" hojaMovil>
  {#if modalTipo === 'manual'}
    <div class="info-row">
      <div class="field field-lg">
        <label for="modal-desc">Descripción *</label>
        <input id="modal-desc" class="form-control" maxlength="120" bind:value={modalDescripcion} placeholder="Recargo por transporte" />
      </div>
      <div class="field">
        <label for="modal-cant">Cantidad</label>
        <input id="modal-cant" class="form-control" type="number" min="1" step="1" bind:value={modalCantidad} />
      </div>
      <div class="field">
        <label for="modal-precio">Precio unitario</label>
        <FormattedNumberField id="modal-precio" class="form-control" min={0} bind:value={modalPrecio} />
      </div>
    </div>
  {:else if modalTipo}
    <input
      class="form-control"
      type="search"
      bind:value={modalBusqueda}
      placeholder={modalTipo === 'item' ? 'Buscar artículo…' : 'Buscar servicio…'}
      style="margin-bottom:12px;"
    />
    <div class="table-wrapper" style="max-height:240px;overflow-y:auto;">
      <table class="table">
        <tbody>
          {#each resultadosModal as opcion (opcion.id)}
            <tr
              class="fila-catalogo"
              class:fila-catalogo--activa={modalElegido?.id === opcion.id}
              on:click={() => elegirEnModal(opcion)}
            >
              <td>{opcion.name}</td>
              <td style="text-align:right;white-space:nowrap;">${fmt(opcion.rental_price ?? opcion.price)}</td>
            </tr>
          {:else}
            <tr><td style="text-align:center;color:var(--text-muted);padding:16px;">Sin resultados.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if modalElegido}
      <div class="info-row" style="margin-top:12px;">
        <div class="field">
          <label for="modal-cant">Cantidad</label>
          <input id="modal-cant" class="form-control" type="number" min="1" step="1" bind:value={modalCantidad} />
        </div>
        <div class="field">
          <label for="modal-precio">Precio unitario</label>
          <FormattedNumberField id="modal-precio" class="form-control" min={0} bind:value={modalPrecio} />
        </div>
      </div>
    {/if}
  {/if}

  <div slot="footer">
    <button class="btn btn-secondary" on:click={cerrarModal}><Icon name="x" size={16} />Cancelar</button>
    <button
      class="btn btn-primary"
      disabled={modalTipo === 'manual' ? !modalDescripcion.trim() : !modalElegido}
      on:click={agregarLinea}
    >
      <Icon name="check" size={16} />Agregar
    </button>
  </div>
</Modal>

<style>
  /* Mismo idioma de formulario que el resto de Desktop: `.info-row` de campos
     con `.form-control`, definidos en cada pagina. */
  .info-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field    { display: flex; flex-direction: column; min-width: 150px; }
  .field-lg { flex: 1.5; min-width: 220px; }
  .field label { font-size: .82rem; font-weight: 600; margin-bottom: 4px; }

  .titulo-seccion { margin: 0 0 10px; font-size: 1rem; }

  /* Fondo hundido + pastilla, igual que "Solo stock bajo" en Inventario. */
  .casilla {
    display: flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    margin: 12px 0;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    font-size: .9em;
    color: var(--text-muted);
    cursor: pointer;
  }

  .casilla input[type='checkbox'] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
    cursor: pointer;
    flex-shrink: 0;
  }

  .pick-item--boton {
    width: 100%;
    border: none;
    background: var(--bg-surface);
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .cantidad-mini {
    width: 4.5rem;
    padding: 3px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    text-align: center;
    font: inherit;
  }

  .cuenta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent-active);
    font-size: .76rem;
    font-weight: 700;
  }

  .agregar-tipos {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 10px 0 16px;
  }

  .tipo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    border: 1px dashed var(--border-strong, var(--border-color));
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    font-size: .88rem;
    cursor: pointer;
  }

  .tipo-btn:hover {
    border-style: solid;
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .linea-card {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .linea-card-tag {
    font-weight: 400;
    color: var(--text-muted);
  }

  .btn-icono {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .btn-icono:hover {
    background: var(--surface-sunken);
    color: var(--danger, #dc2626);
  }

  .fila-catalogo {
    cursor: pointer;
  }

  .fila-catalogo:hover {
    background: var(--surface-sunken);
  }

  .fila-catalogo--activa {
    background: var(--accent-subtle);
  }
</style>
