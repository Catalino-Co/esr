<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { summarizePayments, validatePaymentAmount, canVoidPayment } from '@esr/core';
  import { fmt } from '@esr/reports';
  import { unwrap, unwrapOr } from '$lib/ipc';

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
  let errorMsg = '';
  let okMsg = '';

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
  $: cobrable = invoice && invoice.status !== 'anulada';
  $: cobrosVivos = payments.filter((p) => p.status !== 'anulado').length;
  $: entregasVivas = enlaces.filter((e) => e.is_active === 1).length;

  async function registrarCobro() {
    errorMsg = '';
    okMsg = '';
    if (!validatePaymentAmount(importe)) {
      errorMsg = 'El importe debe ser mayor que cero.';
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
      okMsg = 'Cobro registrado.';
      await cargar();
    } catch (err) {
      errorMsg = err.message;
    } finally {
      trabajando = false;
    }
  }

  async function anularCobro(pago) {
    if (!canVoidPayment(pago)) return;
    const motivo = prompt('Motivo de la anulación del cobro:');
    if (motivo === null) return;
    errorMsg = '';
    okMsg = '';
    try {
      unwrap(await window.api.payments.void(pago.id, motivo));
      okMsg = 'Cobro anulado.';
      await cargar();
    } catch (err) {
      errorMsg = err.message;
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
    errorMsg = '';
    okMsg = '';
    try {
      const res = unwrap(await window.api.invoices.cancel(invoiceId, motivo));
      okMsg = res.voidedPayments
        ? `Factura anulada. Se anularon también ${res.voidedPayments} cobro(s).`
        : 'Factura anulada.';
      await cargar();
    } catch (err) {
      errorMsg = err.message;
    }
  }
</script>

{#if cargando}
  <div class="card"><p style="color:var(--text-muted);">Cargando…</p></div>
{:else if !invoice}
  <div class="card"><div class="alert-error">{errorMsg || 'La factura no existe.'}</div></div>
{:else}
  <div class="card">
    <div class="card-title">
      <span>
        Factura {invoice.invoice_number}
        <span class="badge {invoice.status === 'anulada' ? 'badge-secondary' : 'badge-primary'}"
              style="margin-left:10px;">{invoice.status.toUpperCase()}</span>
      </span>
      <div style="display:flex;gap:10px;">
        {#if cobrable}
          <button class="btn btn-danger" on:click={anularFactura}>Anular factura</button>
        {/if}
        <button class="btn btn-secondary" on:click={() => goto('/invoices')}>← Volver</button>
      </div>
    </div>

    {#if errorMsg}<div class="alert-error" style="margin-bottom:15px;">{errorMsg}</div>{/if}
    {#if okMsg}<div class="alert-success" style="margin-bottom:15px;">{okMsg}</div>{/if}

    {#if invoice.status === 'anulada'}
      <div class="alert-error" style="margin-bottom:15px;">
        Factura anulada{invoice.cancel_reason ? `: ${invoice.cancel_reason}` : ''}.
        Sus entregas volvieron a estar disponibles para facturar.
      </div>
    {/if}

    <div style="display:flex;gap:40px;flex-wrap:wrap;margin-bottom:20px;">
      <div><small style="color:var(--text-muted);">Cliente</small><br /><strong>{invoice.client_name || '—'}</strong></div>
      <div><small style="color:var(--text-muted);">Orden</small><br />
        <strong>{invoice.work_order_id ? `WO-${String(invoice.work_order_id).padStart(5, '0')}` : '—'}</strong>
      </div>
      <div><small style="color:var(--text-muted);">Fecha</small><br /><strong>{invoice.date || '—'}</strong></div>
      <div><small style="color:var(--text-muted);">Vencimiento</small><br /><strong>{invoice.due_date || '—'}</strong></div>
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
              <td>{it.description || '—'}</td>
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
          <input id="importe" class="form-control" type="number" min="0.01" step="0.01" bind:value={importe} />
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
            {trabajando ? 'Registrando…' : 'Registrar cobro'}
          </button>
        </div>
      </div>
    {:else}
      <p style="color:var(--text-muted);">Esta factura está anulada: no admite cobros nuevos.</p>
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

<style>
  /* `--accent-active`, no `--primary`: en oscuro el acento como LETRA da 3.08:1
     sobre la tarjeta y no pasa AA. El activo da 7.34:1 en oscuro y 9.93:1 en
     claro. Desktop tiene el mismo fallo en otras pantallas; queda anotado. */

  /* Mismo idioma de formulario que el resto de Desktop: `.info-row` de campos
     con `.form-control`, definidos en cada pagina. */
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
</style>
