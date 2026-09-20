<script>
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { DOCUMENT_TYPE_LABELS, formatDate, formatDateAbsolute, formatMoney, statusBadgeClass, statusLabel, todayISO } from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';
	import { FormattedNumberField, Icon, PdfPreviewModal } from '@esr/ui';
	// Subruta `/formatters`, NO la raiz de `@esr/reports`: la raiz reexporta
	// `generateQuotationPDF` y compañia, que importan jsPDF a nivel de modulo, y
	// un import asi en un componente Svelte se evalua TAMBIEN en el servidor,
	// donde `Blob`/`URL.createObjectURL` no existen. `invoiceItemLabel` es solo
	// texto y no necesita nada de eso.
	import { invoiceItemLabel } from '@esr/reports/formatters';
	import { can } from '$lib/can';
	import { dangerModal } from '$lib/stores/dangerModal';
	import { toasts } from '$lib/stores/toasts';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
		if (form?.success) toasts.success(form.success);
	});

	const hoy = todayISO();

	let cobrando = $state(false);
	let anulando = $state(false);
	let errorCobro = $state(null);
	let errorAnular = $state(null);
	let borrador = $state({});

	function abrirCobro() {
		borrador = { date: hoy, amount: String(data.summary.balance || '') };
		errorCobro = null;
		cobrando = true;
	}

	function cerrarCobro() {
		cobrando = false;
		errorCobro = null;
		borrador = {};
	}

	function cerrarAnular() {
		anulando = false;
		errorAnular = null;
	}

	const alCobrar = () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrarCobro();
			return;
		}
		if (result.data?.values) borrador = { ...borrador, ...result.data.values };
		errorCobro = result.data?.error ?? 'No se pudo registrar el cobro.';
	};

	const alAnular = () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrarAnular();
			return;
		}
		errorAnular = result.data?.error ?? 'No se pudo anular la factura.';
	};

	/** Las entregas liberadas por una anulación se marcan, no se ocultan. */
	const entregasVivas = $derived(data.conduces.filter((c) => c.is_active === 1));

	/* ── Imprimir ──────────────────────────────────────────────────────────
	 * Mismo patrón que la orden y la cotización: el servidor manda los datos Y
	 * registra `document.printed`, y el PDF se arma en cliente con jsPDF.
	 */
	let verPdf = $state(false);
	let pdfUrl = $state('');
	let pdfNombre = $state('factura.pdf');
	let generando = $state(false);

	async function imprimir() {
		if (generando) return;
		generando = true;
		pdfUrl = '';
		verPdf = true;
		try {
			const res = await fetch(`${page.url.pathname}/document`, { method: 'POST' });
			if (!res.ok) throw new Error('El servidor rechazó la petición.');
			const { company, invoice: fila, items: lineas } = await res.json();
			// Import DINÁMICO: jsPDF pesa ~400 KB, y en SSR un import de nivel
			// superior se evalúa también en el servidor, donde `Blob` y
			// `URL.createObjectURL` no existen.
			const { generateInvoicePDF } = await import('@esr/reports/invoices');
			const { url, filename } = generateInvoicePDF(fila, lineas, 'preview', company);
			pdfUrl = url;
			pdfNombre = filename;
		} catch (/** @type {any} */ e) {
			verPdf = false;
			dangerModal.show(`No se pudo generar el documento. ${e?.message ?? ''}`.trim());
		} finally {
			generando = false;
		}
	}

	/* ── Ver PDF del documento origen (orden o cotización) ───────────────────
	 * Mismo patrón que `imprimir()` de arriba, con su propio cuarteto de estado
	 * -sufijo `Ref`- para no chocar con el visor de la factura. Una factura
	 * viene de UNA orden o de UNA cotización, nunca las dos a la vez, así que
	 * una sola función parametrizada basta para las dos.
	 */
	let verPdfRef = $state(false);
	let pdfUrlRef = $state('');
	let pdfNombreRef = $state('documento.pdf');
	let generandoRef = $state(false);

	/** @param {'orden' | 'cotizacion'} tipo */
	async function imprimirRef(tipo) {
		if (generandoRef) return;
		generandoRef = true;
		pdfUrlRef = '';
		verPdfRef = true;
		try {
			if (tipo === 'orden') {
				const res = await fetch(`/work-orders/${data.invoice.work_order_id}/document`, {
					method: 'POST'
				});
				if (!res.ok) throw new Error('El servidor rechazó la petición.');
				const { company, order: fila, items: lineas } = await res.json();
				const { generateWorkOrderPDF } = await import('@esr/reports/rentals');
				const { url, filename } = generateWorkOrderPDF(fila, lineas, 'preview', company);
				pdfUrlRef = url;
				pdfNombreRef = filename;
			} else {
				const res = await fetch(`/quotes/${data.invoice.quotation_id}/document`, {
					method: 'POST'
				});
				if (!res.ok) throw new Error('El servidor rechazó la petición.');
				const { company, quotation: fila, items: lineas } = await res.json();
				const { generateQuotationPDF } = await import('@esr/reports/quotes');
				const { url, filename } = generateQuotationPDF(fila, lineas, 'preview', company);
				pdfUrlRef = url;
				pdfNombreRef = filename;
			}
		} catch (/** @type {any} */ e) {
			verPdfRef = false;
			dangerModal.show(`No se pudo generar el documento. ${e?.message ?? ''}`.trim());
		} finally {
			generandoRef = false;
		}
	}
</script>

<!--
	La cabecera reutiliza `.herramientas` de theme.css, igual que la ficha de
	la orden: número y estado a la izquierda, la acción que toca según el
	estado a la derecha, y Volver/Imprimir en un grupo de iconos aparte.
-->
<div class="herramientas">
	<div class="titulo">
		<h1>Factura {data.invoice.invoice_number}</h1>
		<span class="badge {statusBadgeClass(data.invoice.status)}">{statusLabel(data.invoice.status)}</span>
	</div>

	<div class="herramientas-datos">
		{#if data.invoice.status === 'borrador'}
			{#if can('invoices.update')}
				<a class="btn-secondary" href="/invoices/{data.invoice.id}/edit">Editar</a>
			{/if}
			{#if can('invoices.finalize')}
				<form method="POST" action="?/finalize" use:enhance>
					<button type="submit" class="btn-primary">Finalizar factura</button>
				</form>
			{/if}
		{/if}
		{#if data.invoice.status !== 'anulada' && can('invoices.cancel')}
			<button type="button" class="btn-danger" onclick={() => (anulando = true)}>
				Anular factura
			</button>
		{/if}

		<div class="grupo">
			<a class="grupo-btn" href="/invoices" aria-label="Volver a facturas" title="Volver a facturas">
				<Icon name="back" size={18} />
			</a>
			<button
				type="button"
				class="grupo-btn"
				onclick={imprimir}
				disabled={generando}
				aria-label="Imprimir la factura"
				title="Imprimir la factura"
			>
				<Icon name="printer" size={18} />
			</button>
		</div>
	</div>
</div>

<section class="panel">
	<div class="info-rows">
		<div class="info-row">
			<span class="info-label">Fecha</span>
			<span class="info-value">{formatDateAbsolute(data.invoice.date)}</span>
		</div>
		<div class="info-row">
			<span class="info-label">Orden</span>
			<span class="info-value">
				{#if data.invoice.work_order_id}
					{data.invoice.order_number || `#${data.invoice.work_order_id}`}
					{#if can('work_orders.view')}
						<button type="button" class="btn-link" onclick={() => imprimirRef('orden')}>Ver PDF</button>
					{/if}
				{:else}
					—
				{/if}
			</span>
		</div>
		{#if data.invoice.quotation_id}
			<div class="info-row">
				<span class="info-label">Cotización</span>
				<span class="info-value">
					{data.invoice.quote_number || `#${data.invoice.quotation_id}`}
					{#if can('quotes.view')}
						<button type="button" class="btn-link" onclick={() => imprimirRef('cotizacion')}>Ver PDF</button>
					{/if}
				</span>
			</div>
		{/if}
	</div>

	<h2 class="sec-title" style="margin-top: var(--sp-5)">Cliente</h2>
	<div class="sunken-card" style="margin-bottom: var(--sp-4)">
		<div class="info-rows">
			<div class="info-row">
				<span class="info-label">Nombre</span>
				<span class="info-value">
					{#if data.invoice.client_id}
						<a href="/customers/{data.invoice.client_id}">{data.invoice.client_name || '—'}</a>
					{:else}
						{data.invoice.client_name || '—'}
					{/if}
				</span>
			</div>
			<div class="info-row">
				<span class="info-label">Dirección</span>
				<span class="info-value">{data.customer?.address || '—'}</span>
			</div>
			<div class="info-row">
				<span class="info-label">{DOCUMENT_TYPE_LABELS[data.customer?.document_type] ?? 'Documento'}</span>
				<span class="info-value">{data.customer?.document_id || '—'}</span>
			</div>
			<div class="info-row">
				<span class="info-label">Teléfono</span>
				<span class="info-value">{data.customer?.phone || '—'}</span>
			</div>
			<div class="info-row">
				<span class="info-label">Email</span>
				<span class="info-value">{data.customer?.email || '—'}</span>
			</div>
		</div>
	</div>

	{#if data.invoice.status === 'anulada'}
		<div class="alert-error" role="status">
			Factura anulada{data.invoice.cancel_reason ? `: ${data.invoice.cancel_reason}` : ''}. Sus
			entregas volvieron a estar disponibles para facturar.
		</div>
	{/if}

	{#if data.invoice.status === 'borrador'}
		<p class="panel-hint">Esta factura es un borrador: sus líneas y datos todavía se pueden editar.</p>
	{/if}

	{#if data.invoice.notes}
		<p><strong>Notas:</strong> {data.invoice.notes}</p>
	{/if}

	<h2 class="sec-title" style="margin-top: 24px">Líneas</h2>
	<table class="data-table">
		<thead>
			<tr>
				<th>Artículo</th>
				<th>Código</th>
				<th class="num">Cantidad</th>
				<th class="num">Precio</th>
				<th class="num">Importe</th>
			</tr>
		</thead>
		<tbody>
			{#each data.items as item (item.id)}
				<tr>
					<td>{invoiceItemLabel(item)}</td>
					<td>{item.internal_code || '—'}</td>
					<td class="num">{item.quantity}</td>
					<td class="num">{formatMoney(item.price)}</td>
					<td class="num">{formatMoney(item.total)}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr>
				<td colspan="4" class="num">Subtotal</td>
				<td class="num">{formatMoney(data.invoice.subtotal)}</td>
			</tr>
			{#if Number(data.invoice.discount) > 0}
				<tr>
					<td colspan="4" class="num">Descuento</td>
					<td class="num">−{formatMoney(data.invoice.discount)}</td>
				</tr>
			{/if}
			{#if Number(data.invoice.tax_amount) > 0}
				<tr>
					<td colspan="4" class="num">ITBIS</td>
					<td class="num">{formatMoney(data.invoice.tax_amount)}</td>
				</tr>
			{/if}
			<tr class="fila-total">
				<td colspan="4" class="num">Total</td>
				<td class="num">{formatMoney(data.invoice.total)}</td>
			</tr>
		</tfoot>
	</table>

	<h2 class="sec-title" style="margin-top: 24px">Entregas que cubre</h2>
	{#if data.conduces.length === 0}
		<p class="empty-state">Sin entregas asociadas.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Conduce</th><th>Fecha</th><th>Estado del enlace</th></tr>
			</thead>
			<tbody>
				{#each data.conduces as fila (fila.id)}
					<tr>
						<td><a href="/conduces/{fila.conduce_id}">{fila.note_number || `#${fila.conduce_id}`}</a></td>
						<td>{formatDate(fila.date)}</td>
						<td>
							{#if fila.is_active === 1}
								<span class="badge badge-success">Facturada</span>
							{:else}
								<span class="badge badge-muted">Liberada</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<!-- La factura es el documento que se cobra: su estado de cuenta vive aquí. -->
<section class="panel" style="margin-top: var(--sp-6)">
	<div class="page-header">
		<h2 class="sec-title">Estado de cuenta</h2>
		<div class="page-header-actions">
			{#if data.cobrable && can('payments.register')}
				<button type="button" class="btn-primary btn-new" onclick={abrirCobro}>Registrar cobro</button>
			{/if}
		</div>
	</div>

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{formatMoney(data.summary.total)}</strong><span>Total</span></div>
		<div class="metric"><strong>{formatMoney(data.summary.paid)}</strong><span>Cobrado</span></div>
		<div class="metric" class:metric-ok={data.summary.settled}>
			<strong>{data.summary.settled ? 'Saldada' : formatMoney(data.summary.balance)}</strong>
			<span>Saldo</span>
		</div>
		{#if data.summary.overpaid > 0}
			<div class="metric"><strong>{formatMoney(data.summary.overpaid)}</strong><span>Sobrepago</span></div>
		{/if}
	</div>

	{#if !data.cobrable}
		<p class="panel-hint">
			{data.invoice.status === 'borrador'
				? 'Esta factura es un borrador: finalícela para poder registrar cobros.'
				: 'Esta factura está anulada: no admite cobros nuevos.'}
		</p>
	{/if}

	{#if data.payments.length === 0}
		<p class="empty-state">Todavía no se ha registrado ningún cobro.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Fecha</th><th>Método</th><th>Referencia</th><th class="num">Importe</th><th>Estado</th><th>Acciones</th></tr>
			</thead>
			<tbody>
				{#each data.payments as payment (payment.id)}
					{@const anulado = payment.status === 'anulado'}
					<tr>
						<td>{formatDate(payment.date)}</td>
						<td>{payment.method || '—'}</td>
						<td>{payment.reference || '—'}</td>
						<td class="num importe">{formatMoney(payment.amount)}</td>
						<td>
							<span class="badge {statusBadgeClass(payment.status)}">{statusLabel(payment.status)}</span>
						</td>
						<td>
							{#if !anulado && can('payments.void')}
								<form method="POST" action="?/voidPayment" use:enhance>
									<input type="hidden" name="payment_id" value={payment.id} />
									<button type="submit" class="btn-danger btn-sm">Anular</button>
								</form>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal bind:open={cobrando} size="sm" title="Registrar cobro" onclose={cerrarCobro}>
	{#if errorCobro}
		<div class="alert-error" role="alert">{errorCobro}</div>
	{/if}

	<form id="cobro-form" method="POST" action="?/registerPayment" class="form-grid" use:enhance={alCobrar}>
		<div class="form-field full">
			<label for="amount">Importe *</label>
			<FormattedNumberField
				id="amount"
				name="amount"
				min={0.01}
				required
				value={borrador.amount ?? ''}
			/>
		</div>
		<div class="form-field full">
			<label for="date">Fecha</label>
			<input id="date" name="date" type="date" value={borrador.date ?? hoy} />
		</div>
		<div class="form-field full">
			<label for="method">Método</label>
			<select id="method" name="method">
				<option value="efectivo" selected={borrador.method === 'efectivo'}>Efectivo</option>
				<option value="transferencia" selected={borrador.method === 'transferencia'}>Transferencia</option>
				<option value="cheque" selected={borrador.method === 'cheque'}>Cheque</option>
				<option value="tarjeta" selected={borrador.method === 'tarjeta'}>Tarjeta</option>
			</select>
		</div>
		<div class="form-field full">
			<label for="reference">Referencia</label>
			<input id="reference" name="reference" value={borrador.reference ?? ''} />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<input id="notes" name="notes" value={borrador.notes ?? ''} />
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarCobro}><Icon name="x" size={16} />Cancelar</button>
		<button type="submit" form="cobro-form" class="btn-primary"><Icon name="check" size={16} />Registrar</button>
	{/snippet}
</Modal>

<Modal bind:open={anulando} size="sm" title="Anular factura" onclose={cerrarAnular}>
	{#if errorAnular}
		<div class="alert-error" role="alert">{errorAnular}</div>
	{/if}

	<p class="panel-hint">
		Se anularán también sus {data.payments.filter((p) => p.status !== 'anulado').length} cobro(s)
		vigentes, y sus {entregasVivas.length} entrega(s) volverán a estar disponibles para facturar.
		La factura no se borra: queda con estado anulada.
	</p>

	<form id="anular-form" method="POST" action="?/cancelInvoice" class="form-grid" use:enhance={alAnular}>
		<div class="form-field full">
			<label for="reason">Motivo *</label>
			<input id="reason" name="reason" required placeholder="Por qué se anula" />
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarAnular}><Icon name="x" size={16} />Cancelar</button>
		<button type="submit" form="anular-form" class="btn-danger">Anular factura</button>
	{/snippet}
</Modal>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename={pdfNombre} title="Vista previa de la factura" />
<PdfPreviewModal bind:show={verPdfRef} pdfUrl={pdfUrlRef} filename={pdfNombreRef} title="Vista previa del documento" />

<style>
	.titulo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
	}

	.titulo h1 {
		margin: 0;
		font-size: var(--font-xl);
	}

	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.importe {
		font-weight: 600;
	}

	.fila-total td {
		font-weight: 700;
	}

	.metric-ok strong {
		color: var(--success-text);
	}

	.text-muted {
		color: var(--text-secondary);
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
