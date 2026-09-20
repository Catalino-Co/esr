<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fmt } from '@esr/reports';
  import { FormattedNumberField, Icon, Modal, SearchPicker } from '@esr/ui';
  import { unwrap, unwrapOr } from '$lib/ipc';
  import { dangerModal } from '$lib/stores/dangerModal.js';

  /**
   * Editar un borrador de factura.
   *
   * Recorte de `/invoices/new`: el origen -orden, cotización o libre- ya
   * quedó fijado cuando se creó el borrador y aquí NO se puede cambiar, así
   * que se quita el selector de origen y las pantallas de «elegir orden» o
   * «elegir cotización». Lo que sí se puede tocar es CUÁLES líneas entran y
   * los datos del pie (fecha/descuento/ITBIS/notas).
   *
   * Un borrador que deja de serlo (se finalizó, o se anuló) ya no se edita
   * aquí -pasa a vivir en `/invoices/detail`, que es donde está «Anular»-,
   * así que esta pantalla rebota para allá si el estado cargado no es
   * `borrador`.
   */
  let invoiceId = null;
  let invoice = null;
  let origen = null; // 'orden' | 'cotizacion' | 'directa', fijado al cargar

  let workOrderId = null;
  let quotationId = null;

  // ── Catálogos (una sola vez) ────────────────────────────────────────────
  let clients = [];
  let allItems = [];
  let allServices = [];

  // ── Origen Orden ──────────────────────────────────────────────────────────
  let conduces = [];
  let serviciosOrden = [];
  let seleccion = new Set();
  let seleccionServicios = new Set();

  // ── Origen Cotización ─────────────────────────────────────────────────────
  let lineasQuote = [];

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
  let descuento = 0;
  let impuesto = 0;
  let notas = '';

  let cargando = true;
  let guardando = false;
  /** Solo el «la factura no existe» del load: el resto pasa por el Modal. */
  let errorMsg = '';

  // Catálogos de una sola vez: cliente, artículos y servicios. Los mismos que
  // carga `/invoices/new`: hacen falta para la ficha «Factura directa» si el
  // borrador es de origen libre.
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
   * El id se lee de la URL de forma REACTIVA, no en `onMount` -mismo motivo
   * que `/invoices/detail`: pasar de editar una factura a otra reutiliza el
   * componente y `onMount` no se vuelve a ejecutar.
   */
  let ultimoId = null;

  $: idUrl = $page.url.searchParams.get('id');
  $: if (typeof window !== 'undefined' && idUrl !== ultimoId) {
    ultimoId = idUrl;
    invoiceId = idUrl ? Number(idUrl) : null;
    cargar();
  }

  /** `true` si esta fila ya la reclamó ESTE borrador (`already_claimed`, con `alsoClaimedByInvoiceId`). */
  function yaReclamada(fila) {
    return Boolean(fila.already_claimed);
  }

  async function cargar() {
    cargando = true;
    errorMsg = '';
    invoice = null;
    origen = null;
    conduces = [];
    serviciosOrden = [];
    seleccion = new Set();
    seleccionServicios = new Set();
    lineasQuote = [];
    lineas = [];
    clienteDirecta = null;
    try {
      const fila = unwrap(await window.api.invoices.findById(invoiceId));
      if (!fila) throw new Error('La factura no existe.');
      if (fila.status !== 'borrador') {
        goto(`/invoices/detail?id=${invoiceId}`);
        return;
      }
      invoice = fila;
      workOrderId = fila.work_order_id || null;
      quotationId = fila.quotation_id || null;
      origen = workOrderId ? 'orden' : quotationId ? 'cotizacion' : 'directa';

      fecha = fila.date || new Date().toISOString().slice(0, 10);
      descuento = Number(fila.discount) || 0;
      impuesto = Number(fila.tax_amount) || 0;
      notas = fila.notes || '';

      if (origen === 'orden') {
        conduces = unwrap(
          await window.api.invoices.listBillable(workOrderId, { alsoClaimedByInvoiceId: invoiceId })
        );
        serviciosOrden = unwrap(
          await window.api.invoices.listBillableServices(workOrderId, { alsoClaimedByInvoiceId: invoiceId })
        );
        seleccion = new Set(conduces.filter(yaReclamada).map((c) => c.id));
        seleccionServicios = new Set(serviciosOrden.filter(yaReclamada).map((s) => s.id));
      } else if (origen === 'cotizacion') {
        const pendientes = unwrap(
          await window.api.invoices.listBillableQuotationItems(quotationId, {
            alsoClaimedByInvoiceId: invoiceId
          })
        );
        lineasQuote = pendientes.map((l) => ({
          ...l,
          on: yaReclamada(l),
          // Cuanto de esta línea reclama YA este borrador. `remaining` no
          // necesita ajuste aparte: ya cuenta lo reclamado por esta factura
          // como "libre" (por `alsoClaimedByInvoiceId`), así que es
          // directamente el tope correcto para `max` más abajo.
          cantidad: Number(l.claimed_quantity ?? 0)
        }));
      } else {
        // Libre: reconstruir el cliente y las líneas ya guardadas. El cliente
        // se busca APARTE del catálogo `clients` de `onMount`, porque ese
        // catálogo puede no haber terminado de cargar todavía cuando este
        // bloque reactivo dispara por primera vez.
        if (fila.client_id) {
          clienteDirecta = await window.api.db.getOne(
            'SELECT id, name, phone, document_id FROM clients WHERE id = ?',
            [fila.client_id]
          );
        }
        // `invoiceItemLabel` (@esr/reports) documenta esta misma forma de fila
        // -`service_id`/`item_id`/`description`/`internal_code`- para decidir
        // artículo/servicio/manual; se reutiliza el mismo criterio aquí.
        const storedItems = unwrapOr(await window.api.invoices.listItems(invoiceId), []);
        lineas = storedItems.map((it) => ({
          uid: siguienteUid++,
          kind: it.service_id != null ? 'service' : it.item_id != null ? 'item' : 'manual',
          ref_id: it.service_id ?? it.item_id ?? null,
          description: it.description,
          code: it.internal_code ?? null,
          quantity: Number(it.quantity) || 0,
          price: Number(it.price) || 0
        }));
      }
    } catch (err) {
      errorMsg = err.message;
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
  $: puedeGuardar =
    !excede &&
    ((origen === 'orden' && nElegidas > 0) ||
      (origen === 'cotizacion' && nElegidas > 0) ||
      (origen === 'directa' && !!clienteDirecta && nElegidas > 0));

  async function guardar() {
    if (guardando || !puedeGuardar) return;
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

      unwrap(
        await window.api.invoices.updateDraft(invoiceId, {
          source,
          date: fecha || null,
          discount: rebaja,
          tax_amount: impuestoNum,
          notes: notas || null
        })
      );
      goto(`/invoices/detail?id=${invoiceId}`);
    } catch (err) {
      dangerModal.show(err.message);
    } finally {
      guardando = false;
    }
  }
</script>

<div class="herramientas">
  <div class="titulo">
    <h1>Editar factura{invoice ? ` ${invoice.invoice_number}` : ''}</h1>
  </div>
  <div class="herramientas-datos">
    <div class="grupo">
      <a
        class="grupo-btn"
        href={invoiceId ? `/invoices/detail?id=${invoiceId}` : '/invoices'}
        aria-label="Volver a la factura"
        title="Volver a la factura"
      >
        <Icon name="back" size={18} />
      </a>
    </div>
  </div>
</div>

{#if cargando}
  <div class="card"><p style="color:var(--text-muted);">Cargando…</p></div>
{:else if !invoice}
  <div class="card"><div class="alert-error">{errorMsg || 'La factura no existe.'}</div></div>
{:else}
  <div class="card">
    <div class="detail-layout">
      <div class="detail-main">
        {#if origen === 'orden'}
          {#if conduces.length === 0 && serviciosOrden.length === 0}
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
          <h4 class="titulo-seccion">
            Líneas pendientes de {invoice.quote_number || `#${quotationId}`}
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
          <button class="btn btn-secondary" on:click={() => goto(`/invoices/detail?id=${invoiceId}`)}>
            <Icon name="x" size={16} />Cancelar
          </button>
          <button class="btn btn-primary" disabled={guardando || !puedeGuardar} on:click={guardar}>
            <Icon name="check" size={16} />{guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </div>
  </div>
{/if}

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
  .titulo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .titulo h1 {
    margin: 0;
    font-size: var(--font-xl);
  }

  /* Mismo idioma de formulario que el resto de Desktop: `.info-row` de campos
     con `.form-control`, definidos en cada pagina. */
  .info-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field    { display: flex; flex-direction: column; min-width: 150px; }
  .field-lg { flex: 1.5; min-width: 220px; }
  .field label { font-size: .82rem; font-weight: 600; margin-bottom: 4px; }

  .titulo-seccion { margin: 0 0 10px; font-size: 1rem; }

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
