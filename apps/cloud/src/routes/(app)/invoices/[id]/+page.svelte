<script>
	import { enhance } from '$app/forms';
	import {
		formatDate,
		formatMoney,
		RECORD_STATE,
		recordStateLabel,
		statusBadgeClass,
		statusLabel,
		todayISO
	} from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

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

	/** Archivar retira de circulación; no borra. Es un eje distinto del anulado. */
	const archivada = $derived(data.invoice.is_active === RECORD_STATE.ARCHIVED);
</script>

<section class="panel">
	<div class="page-header">
		<h1>Factura {data.invoice.invoice_number}</h1>
		<div class="page-header-actions">
			{#if data.cobrable && can('invoices.cancel')}
				<button type="button" class="btn-danger" onclick={() => (anulando = true)}>
					Anular factura
				</button>
			{/if}
			{#if can('invoices.archive')}
				<form method="POST" action="?/setState" use:enhance>
					<input
						type="hidden"
						name="state"
						value={archivada ? RECORD_STATE.ACTIVE : RECORD_STATE.ARCHIVED}
					/>
					<button type="submit" class="btn-secondary">
						{archivada ? 'Restaurar' : 'Archivar'}
					</button>
				</form>
			{/if}
			<a class="btn-secondary" href="/invoices">Volver</a>
		</div>
	</div>

	{#if !cobrando && !anulando}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="alert-success" role="status">{form.success}</div>
		{/if}
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric">
			<strong>
				<span class="badge {statusBadgeClass(data.invoice.status)}">
					{statusLabel(data.invoice.status)}
				</span>
			</strong>
			<span>Estado</span>
		</div>
		<div class="metric">
			<strong>
				{#if data.invoice.client_id}
					<a href="/customers/{data.invoice.client_id}">{data.invoice.client_name || '—'}</a>
				{:else}
					{data.invoice.client_name || '—'}
				{/if}
			</strong>
			<span>Cliente</span>
		</div>
		<div class="metric">
			<strong>
				{#if data.invoice.work_order_id}
					<a href="/work-orders/{data.invoice.work_order_id}">
						{data.invoice.order_number || `#${data.invoice.work_order_id}`}
					</a>
				{:else}
					—
				{/if}
			</strong>
			<span>Orden</span>
		</div>
		<div class="metric"><strong>{formatDate(data.invoice.date)}</strong><span>Fecha</span></div>
		{#if archivada}
			<div class="metric">
				<strong>{recordStateLabel(data.invoice.is_active)}</strong>
				<span>Circulación</span>
			</div>
		{/if}
	</div>

	{#if data.invoice.status === 'anulada'}
		<div class="alert-error" role="status">
			Factura anulada{data.invoice.cancel_reason ? `: ${data.invoice.cancel_reason}` : ''}. Sus
			entregas volvieron a estar disponibles para facturar.
		</div>
	{/if}

	{#if data.invoice.notes}
		<p><strong>Notas:</strong> {data.invoice.notes}</p>
	{/if}

	<h2 class="sec-title">Líneas</h2>
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
					<td>{item.description || item.item_id || '—'}</td>
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
<section class="panel">
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
		<p class="panel-hint">Esta factura está anulada: no admite cobros nuevos.</p>
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
			<input
				id="amount"
				name="amount"
				type="number"
				step="0.01"
				min="0.01"
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
		<button type="button" class="btn-secondary" onclick={cerrarCobro}>Cancelar</button>
		<button type="submit" form="cobro-form" class="btn-primary">Registrar</button>
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
		<button type="button" class="btn-secondary" onclick={cerrarAnular}>Cancelar</button>
		<button type="submit" form="anular-form" class="btn-danger">Anular factura</button>
	{/snippet}
</Modal>

<style>
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
