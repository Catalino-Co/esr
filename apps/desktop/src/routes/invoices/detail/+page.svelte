<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    DOCUMENT_TYPE_LABELS,
    canVoidPayment,
    statusBadgeClass,
    statusLabel,
    summarizePayments,
    validatePaymentAmount
  } from '@esr/core';
  import { fmt, generateInvoicePDF, generateQuotationPDF, generateWorkOrderPDF, invoiceItemLabel } from '@esr/reports';
  import { FormattedNumberField, Icon, PdfPreviewModal } from '@esr/ui';
  import { unwrap, unwrapOr } from '$lib/ipc';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { toasts } from '$lib/stores/toasts.js';

  /**
   * Ficha de la factura: estado de cuenta y cobros.
   *
   * La ruta es `detail`, no `edit` como el resto de Desktop, a proposito: una
   * factura emitida NO se edita, y llamar `edit` a la URL es una invitacion
   * permanente a que alguien añada un «Guardar» que no debe existir.
   */
  let invoiceId = null;
  let invoice = null;
  let items = [];
  let enlaces = [];
  let payments = [];

  let cargando = true;
  /** Solo el «la factura no existe» del load: el resto pasa por Toast/Modal. */
  let errorMsg = '';

  let importe = '';
  let metodo = 'efectivo';
  let referencia = '';
  let fechaCobro = new Date().toISOString().slice(0, 10);
  let trabajando = false;

  // Reactivo y no `onMount`: ir de una factura a otra reutiliza el componente,
  // asi que leer la URL una sola vez dejaria la pantalla en la anterior.
  let ultimoId = null;

  $: idUrl = $page.url.searchParams.get('id');
  $: if (typeof window !== 'undefined' && idUrl !== ultimoId) {
    ultimoId = idUrl;
    invoiceId = idUrl ? Number(idUrl) : null;
    cargar();
  }

  async function cargar() {
    cargando = true;
    try {
      invoice = unwrap(await window.api.invoices.findById(invoiceId));
      if (!invoice) throw new Error('La factura no existe.');
      items = unwrapOr(await window.api.invoices.listItems(invoiceId), []);
      enlaces = unwrapOr(await window.api.invoices.listConduces(invoiceId), []);
      payments = unwrapOr(await window.api.payments.listForInvoice(invoiceId), []);
    } catch (err) {
      errorMsg = err.message;
    } finally {
      cargando = false;
    }
  }

  // El estado de cuenta sale de la MISMA regla que usa Cloud. Cero logica local.
  $: resumen = invoice ? summarizePayments(invoice.total, payments) : null;
  // Cobrable es SOLO «emitida»: un borrador no acepta cobros todavia -hay que
  // finalizarlo primero- y una anulada tampoco. Antes esta misma variable
  // tambien decidia si se mostraba «Anular factura», pero esa es una pregunta
  // DISTINTA -anular cabe desde borrador o emitida, cobrar no-, asi que abajo
  // el boton de Anular ya no depende de `cobrable`.
  $: cobrable = invoice && invoice.status === 'emitida';
  $: cobrosVivos = payments.filter((p) => p.status !== 'anulado').length;
  $: entregasVivas = enlaces.filter((e) => e.is_active === 1).length;
  // Documento fiscal del cliente: «RNC 131-...», o solo el numero si aun no
  // llega el tipo desde el backend (columna en camino), o «—» si no hay nada.
  $: documentoCliente = invoice && invoice.client_document
    ? `${DOCUMENT_TYPE_LABELS[invoice.client_document_type] || ''} ${invoice.client_document}`.trim()
    : '—';

  async function registrarCobro() {
    if (!validatePaymentAmount(importe)) {
      dangerModal.show('El importe debe ser mayor que cero.');
      return;
    }
    trabajando = true;
    try {
      unwrap(
        await window.api.payments.create({
          invoice_id: invoiceId,
          amount: Number(importe),
          method: metodo,
          reference: referencia || null,
          date: fechaCobro || null
        })
      );
      importe = '';
      referencia = '';
      toasts.success('Cobro registrado.');
      await cargar();
    } catch (err) {
      dangerModal.show(err.message);
    } finally {
      trabajando = false;
    }
  }

  async function anularCobro(pago) {
    if (!canVoidPayment(pago)) return;
    const motivo = prompt('Motivo de la anulación del cobro:');
    if (motivo === null) return;
    try {
      unwrap(await window.api.payments.void(pago.id, motivo));
      toasts.success('Cobro anulado.');
      await cargar();
    } catch (err) {
      dangerModal.show(err.message);
    }
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  let showPdfPreview  = false;
  let pdfPreviewUrl   = '';
  let pdfPreviewFile  = '';

  async function imprimir() {
    const datos = unwrap(await window.api.invoices.findForDocument(invoiceId));
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const { url, filename } = generateInvoicePDF(datos.invoice, datos.items, 'preview', company);
    pdfPreviewUrl  = url;
    pdfPreviewFile = filename;
    showPdfPreview = true;
  }

  // Vista previa del documento de ORIGEN (orden o cotizacion), no de la
  // factura. Mismas consultas y mismo generador que usa el boton «Imprimir»
  // de la lista de Ordenes/Cotizaciones respectivamente -no hay, en Desktop,
  // un endpoint IPC por-entidad para esto, asi que se repite el SQL crudo a
  // proposito en vez de inventar uno nuevo a medias-.
  let showRefPreview = false;
  let refPreviewUrl  = '';
  let refPreviewFile = '';
  let generandoRef   = false;

  async function verPdfReferencia() {
    if (generandoRef) return;
    generandoRef = true;
    try {
      const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;

      if (invoice.work_order_id) {
        // Calcado de `imprimir(wo)` en work_orders/+page.svelte, salvo que la
        // orden se busca por id en vez de venir ya cargada en una lista.
        const filas = await window.api.db.get(
          `SELECT w.*, c.name AS client_name, e.name AS event_name
           FROM work_orders w
           LEFT JOIN clients c ON c.id = w.client_id
           LEFT JOIN events e ON e.id = w.event_id
           WHERE w.id = ?`,
          [invoice.work_order_id]
        );
        const wo = filas?.[0];
        if (!wo) throw new Error('La orden ya no existe.');
        // `woItems`/`woServicios`, no `items`: ese nombre ya es el de las
        // lineas de la FACTURA a nivel de modulo, y reusarlo aqui lo taparia.
        const woItems = await window.api.db.get(
          `SELECT wi.quantity, i.name, i.internal_code, NULL AS service_id
           FROM work_order_items wi JOIN items i ON wi.item_id = i.id
           WHERE wi.work_order_id = ?`,
          [wo.id]
        );
        const woServicios = await window.api.db.get(
          `SELECT wi.quantity, s.name, NULL AS internal_code, wi.service_id
           FROM work_order_items wi JOIN services s ON wi.service_id = s.id
           WHERE wi.work_order_id = ?`,
          [wo.id]
        );
        const { url, filename } = generateWorkOrderPDF(wo, [...woItems, ...woServicios], 'preview', company);
        refPreviewUrl  = url;
        refPreviewFile = filename;
      } else if (invoice.quotation_id) {
        // Calcado de `generatePDF(quote)` en quotations/+page.svelte.
        const filas = await window.api.db.get(
          `SELECT q.*, c.name as client_name, e.name as event_name
           FROM quotations q
           LEFT JOIN clients c ON q.client_id = c.id
           LEFT JOIN events e ON q.event_id = e.id
           WHERE q.id = ?`,
          [invoice.quotation_id]
        );
        const quote = filas?.[0];
        if (!quote) throw new Error('La cotización ya no existe.');
        const rows = await window.api.db.get(
          `SELECT qi.*, i.name as item_name, p.name as package_name
           FROM quotation_items qi
           LEFT JOIN items i ON qi.item_id = i.id
           LEFT JOIN packages p ON qi.package_id = p.id
           WHERE qi.quotation_id = ?`,
          [quote.id]
        );
        const quoteItems = rows.map((r) => ({
          name:       r.package_id != null ? r.package_name : r.item_name,
          item_id:    r.item_id,
          package_id: r.package_id,
          quantity:   r.quantity,
          price:      r.price,
          total:      r.quantity * r.price
        }));
        const c = await window.api.db.getOne('SELECT document_id, phone FROM clients WHERE id=?', [quote.client_id]);
        if (c) { quote.client_document = c.document_id; quote.client_phone = c.phone; }
        const { url, filename } = generateQuotationPDF(quote, quoteItems, 'preview', company);
        refPreviewUrl  = url;
        refPreviewFile = filename;
      } else {
        return;
      }
      showRefPreview = true;
    } catch (err) {
      dangerModal.show(err.message);
    } finally {
      generandoRef = false;
    }
  }

  let finalizando = false;
  async function finalizar() {
    if (finalizando) return;
    finalizando = true;
    try {
      unwrap(await window.api.invoices.finalize(invoiceId));
      toasts.success('Factura finalizada.');
      await cargar();
    } catch (err) {
      dangerModal.show(err.message);
    } finally {
      finalizando = false;
    }
  }

  async function anularFactura() {
    // Se dice en voz alta lo que se va a deshacer: anular una factura cobrada
    // deshace dinero ya registrado.
    const aviso =
      `Se anularán también ${cobrosVivos} cobro(s) vigentes y ${entregasVivas} entrega(s) ` +
      `volverán a estar disponibles para facturar.\n\n¿Motivo de la anulación?`;
    const motivo = prompt(aviso);
    if (motivo === null) return;
    try {
      const res = unwrap(await window.api.invoices.cancel(invoiceId, motivo));
      toasts.success(
        res.voidedPayments
          ? `Factura anulada. Se anularon también ${res.voidedPayments} cobro(s).`
          : 'Factura anulada.'
      );
      await cargar();
    } catch (err) {
      dangerModal.show(err.message);
    }
  }
</script>

{#if cargando}
  <div class="card"><p style="color:var(--text-muted);">Cargando…</p></div>
{:else if !invoice}
  <div class="card"><div class="alert-error">{errorMsg || 'La factura no existe.'}</div></div>
{:else}
  <div class="herramientas">
    <div class="titulo">
      <h1>Factura {invoice.invoice_number}</h1>
      <span class="badge {statusBadgeClass(invoice.status)}">{statusLabel(invoice.status)}</span>
    </div>
    <div class="herramientas-datos">
      {#if invoice.status === 'borrador'}
        <button class="btn btn-secondary" on:click={() => goto(`/invoices/edit?id=${invoiceId}`)}>
          <Icon name="edit" size={16} />Editar
        </button>
        <button class="btn btn-primary" on:click={finalizar} disabled={finalizando}>
          {finalizando ? 'Finalizando…' : 'Finalizar factura'}
        </button>
      {/if}
      {#if invoice.status !== 'anulada'}
        <button class="btn btn-danger" on:click={anularFactura}>Anular factura</button>
      {/if}
      <div class="grupo">
        <a class="grupo-btn" href="/invoices" aria-label="Volver a facturas" title="Volver a facturas">
          <Icon name="back" size={18} />
        </a>
        <button type="button" class="grupo-btn" on:click={imprimir} aria-label="Imprimir la factura" title="Imprimir la factura">
          <Icon name="printer" size={18} />
        </button>
      </div>
    </div>
  </div>

  <div class="card">
    {#if invoice.status === 'anulada'}
      <div class="alert-error" style="margin-bottom:15px;">
        Factura anulada{invoice.cancel_reason ? `: ${invoice.cancel_reason}` : ''}.
        Sus entregas volvieron a estar disponibles para facturar.
      </div>
    {/if}

    <div class="info-row" style="margin-bottom:20px;">
      <div class="field">
        <label>Fecha</label>
        <div>{invoice.date || '—'}</div>
      </div>
      <div class="field">
        <label>Orden</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <span>{invoice.work_order_id ? `WO-${String(invoice.work_order_id).padStart(5, '0')}` : '—'}</span>
          {#if invoice.work_order_id}
            <button type="button" class="btn-link" disabled={generandoRef} on:click={verPdfReferencia}>Ver PDF</button>
          {/if}
        </div>
      </div>
      {#if invoice.quotation_id}
        <div class="field">
          <label>Cotización</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <span>{invoice.quote_number || `#${invoice.quotation_id}`}</span>
            <button type="button" class="btn-link" disabled={generandoRef} on:click={verPdfReferencia}>Ver PDF</button>
          </div>
        </div>
      {/if}
    </div>

    <div class="sunken-card" style="margin-bottom:20px;">
      <h4 style="margin:0 0 10px;">Cliente</h4>
      <div class="info-row">
        <div class="field field-lg">
          <label>Nombre</label>
          <div>{invoice.client_name || '—'}</div>
        </div>
        <div class="field field-lg">
          <label>Dirección</label>
          <div>{invoice.client_address || '—'}</div>
        </div>
        <div class="field">
          <label>Documento</label>
          <div>{documentoCliente}</div>
        </div>
        <div class="field">
          <label>Teléfono</label>
          <div>{invoice.client_phone || '—'}</div>
        </div>
        <div class="field">
          <label>Email</label>
          <div>{invoice.client_email || '—'}</div>
        </div>
      </div>
    </div>

    <h4 style="margin:0 0 10px;">Líneas</h4>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Artículo</th><th>Código</th>
            <th style="text-align:right;">Cantidad</th>
            <th style="text-align:right;">Precio</th>
            <th style="text-align:right;">Importe</th>
          </tr>
        </thead>
        <tbody>
          {#each items as it}
            <tr>
              <td>{invoiceItemLabel(it)}</td>
              <td style="color:var(--text-muted);">{it.internal_code || '—'}</td>
              <td style="text-align:right;">{it.quantity}</td>
              <td style="text-align:right;">${fmt(it.price)}</td>
              <td style="text-align:right;font-weight:600;">${fmt(it.total)}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr><td colspan="4" style="text-align:right;">Subtotal</td>
              <td style="text-align:right;">${fmt(invoice.subtotal)}</td></tr>
          {#if Number(invoice.discount) > 0}
            <tr><td colspan="4" style="text-align:right;">Descuento</td>
                <td style="text-align:right;">−${fmt(invoice.discount)}</td></tr>
          {/if}
          {#if Number(invoice.tax_amount) > 0}
            <tr><td colspan="4" style="text-align:right;">ITBIS</td>
                <td style="text-align:right;">${fmt(invoice.tax_amount)}</td></tr>
          {/if}
          <tr><td colspan="4" style="text-align:right;font-weight:700;">Total</td>
              <td style="text-align:right;font-weight:700;">${fmt(invoice.total)}</td></tr>
        </tfoot>
      </table>
    </div>

    <h4 style="margin:20px 0 10px;">Entregas que cubre</h4>
    <div class="table-wrapper">
      <table class="table">
        <thead><tr><th>Conduce</th><th>Fecha</th><th style="text-align:right;">Importe</th><th>Enlace</th></tr></thead>
        <tbody>
          {#each enlaces as e}
            <tr style={e.is_active === 1 ? '' : 'opacity:.55;'}>
              <td>
                <button class="btn-link" on:click={() => goto(`/conduces/edit?id=${e.conduce_id}`)}>
                  COND-{String(e.conduce_id).padStart(5, '0')}
                </button>
              </td>
              <td>{e.date || '—'}</td>
              <td style="text-align:right;">${fmt(e.total)}</td>
              <td>
                {#if e.is_active === 1}
                  <span class="badge badge-success">Facturada</span>
                {:else}
                  <span class="badge badge-secondary">Liberada por anulación</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span>Estado de cuenta</span></div>

    <div style="display:flex;gap:40px;flex-wrap:wrap;margin-bottom:20px;">
      <div><small style="color:var(--text-muted);">Total</small><br /><strong>${fmt(resumen.total)}</strong></div>
      <div><small style="color:var(--text-muted);">Cobrado</small><br /><strong>${fmt(resumen.paid)}</strong></div>
      <div><small style="color:var(--text-muted);">Saldo</small><br />
        <strong class={resumen.settled ? 'text-success' : ''}>
          {resumen.settled ? 'Saldada' : `$${fmt(resumen.balance)}`}
        </strong>
      </div>
      {#if resumen.overpaid > 0}
        <div><small style="color:var(--text-muted);">Sobrepago</small><br /><strong>${fmt(resumen.overpaid)}</strong></div>
      {/if}
    </div>

    {#if cobrable}
      <div class="info-row" style="margin-bottom:15px;">
        <div class="field">
          <label for="importe">Importe</label>
          <FormattedNumberField id="importe" class="form-control" min={0.01} bind:value={importe} />
        </div>
        <div class="field">
          <label for="metodo">Método</label>
          <select id="metodo" class="form-control" bind:value={metodo}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="cheque">Cheque</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
        </div>
        <div class="field field-lg">
          <label for="ref">Referencia</label>
          <input id="ref" class="form-control" bind:value={referencia} />
        </div>
        <div class="field">
          <label for="fcobro">Fecha</label>
          <input id="fcobro" class="form-control" type="date" bind:value={fechaCobro} />
        </div>
        <div class="field">
          <button class="btn btn-primary" disabled={trabajando} on:click={registrarCobro}>
            <Icon name="check" size={16} />{trabajando ? 'Registrando…' : 'Registrar cobro'}
          </button>
        </div>
      </div>
    {:else}
      <p style="color:var(--text-muted);">
        {invoice.status === 'anulada'
          ? 'Esta factura está anulada: no admite cobros nuevos.'
          : 'Esta factura es un borrador: no admite cobros hasta que se finalice.'}
      </p>
    {/if}

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr><th>Fecha</th><th>Método</th><th>Referencia</th>
              <th style="text-align:right;">Importe</th><th>Estado</th>
              <th style="text-align:right;">Acciones</th></tr>
        </thead>
        <tbody>
          {#each payments as p}
            <tr style={p.status === 'anulado' ? 'opacity:.55;' : ''}>
              <td>{p.date || '—'}</td>
              <td>{p.method || '—'}</td>
              <td style="color:var(--text-muted);">{p.reference || '—'}</td>
              <td style="text-align:right;font-weight:600;">${fmt(p.amount)}</td>
              <td>
                <span class="badge {p.status === 'anulado' ? 'badge-secondary' : 'badge-success'}">
                  {p.status.toUpperCase()}
                </span>
              </td>
              <td style="text-align:right;">
                {#if canVoidPayment(p)}
                  <button class="btn-icon text-danger" title="Anular cobro"
                          on:click={() => anularCobro(p)}>🚫</button>
                {:else}
                  <span style="color:var(--text-muted);">—</span>
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">
                Todavía no se ha registrado ningún cobro.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFile} title="Vista previa de la factura" />

<PdfPreviewModal bind:show={showRefPreview} pdfUrl={refPreviewUrl}
  filename={refPreviewFile} title="Vista previa del documento de referencia" />

<style>
  /* `--accent-active`, no `--primary`: en oscuro el acento como LETRA da 3.08:1
     sobre la tarjeta y no pasa AA. El activo da 7.34:1 en oscuro y 9.93:1 en
     claro. Desktop tiene el mismo fallo en otras pantallas; queda anotado. */

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
     con `.form-control`, definidos en cada pagina. Se reutiliza tambien para
     filas de solo lectura (Fecha/Orden/Cotización, ficha del cliente): el
     `.field` ya sabe alinear una etiqueta chica sobre un valor. */
  .info-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field    { display: flex; flex-direction: column; min-width: 150px; }
  .field-lg { flex: 1.5; min-width: 220px; }
  .field label { font-size: .82rem; font-weight: 600; margin-bottom: 4px; }
  .field small { margin-top: 4px; }

  .btn-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent-active);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-link:disabled {
    opacity: .6;
    cursor: default;
  }
</style>
