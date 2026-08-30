<script>
	import { enhance } from '$app/forms';
	import { formatDate, formatMoney, statusBadgeClass, statusLabel, todayISO } from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	const hoy = todayISO();

	let cobrando = $state(false);
	let errorCobro = $state(null);
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

	const alCobrar = () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrarCobro();
			return;
		}
		if (result.data?.values) borrador = { ...borrador, ...result.data.values };
		errorCobro = result.data?.error ?? 'No se pudo registrar el cobro.';
	};
</script>

<section class="panel">
	<div class="page-header">
		<h1>Conduce {data.conduce.note_number || `#${data.conduce.id}`}</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/conduces/{data.conduce.id}/print" target="_blank" rel="noopener">
				Imprimir conduce
			</a>
			<a class="btn-secondary" href="/conduces">Volver</a>
		</div>
	</div>

	{#if !cobrando}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="alert-success" role="status">{form.success}</div>
		{/if}
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{statusLabel(data.conduce.conduce_type)}</strong><span>Tipo</span></div>
		<div class="metric">
			<strong>
				<span class="badge {statusBadgeClass(data.conduce.status)}">{statusLabel(data.conduce.status)}</span>
			</strong>
			<span>Estado</span>
		</div>
		<div class="metric">
			<strong>
				<a href="/work-orders/{data.conduce.work_order_id}">
					{data.order?.order_number || `#${data.conduce.work_order_id}`}
				</a>
			</strong>
			<span>Orden</span>
		</div>
		<div class="metric"><strong>{data.conduce.received_by_name || '—'}</strong><span>Receptor</span></div>
	</div>

	{#if data.conduce.notes}
		<p><strong>Notas:</strong> {data.conduce.notes}</p>
	{/if}

	<h2 class="sec-title">Artículos</h2>
	<table class="data-table">
		<thead>
			<tr><th>Artículo</th><th>Código</th><th>Cantidad</th><th>Estado</th></tr>
		</thead>
		<tbody>
			{#each data.items as item (item.id)}
				<tr>
					<td>{item.name || item.item_id}</td>
					<td>{item.internal_code || '—'}</td>
					<td>{item.quantity}</td>
					<td>
						<span class="badge {statusBadgeClass(item.status)}">{statusLabel(item.status)}</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<!-- El conduce es el documento que se cobra: su estado de cuenta vive aquí. -->
<section class="panel">
	<div class="page-header">
		{#if data.cobrable && can('payments.register')}
			<button type="button" class="btn-primary btn-new" onclick={abrirCobro}>Registrar cobro</button>
		{/if}
	</div>

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{formatMoney(data.summary.total)}</strong><span>Total</span></div>
		<div class="metric"><strong>{formatMoney(data.summary.paid)}</strong><span>Cobrado</span></div>
		<div class="metric" class:metric-ok={data.summary.settled}>
			<strong>{data.summary.settled ? 'Saldado' : formatMoney(data.summary.balance)}</strong>
			<span>Saldo</span>
		</div>
		{#if data.summary.overpaid > 0}
			<div class="metric"><strong>{formatMoney(data.summary.overpaid)}</strong><span>Sobrepago</span></div>
		{/if}
	</div>

	{#if !data.cobrable}
		<p class="panel-hint">Este conduce está anulado: no admite cobros nuevos.</p>
	{/if}

	{#if data.payments.length === 0}
		<p class="empty-state">Todavía no se ha registrado ningún cobro.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Fecha</th><th>Método</th><th>Referencia</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr>
			</thead>
			<tbody>
				{#each data.payments as payment (payment.id)}
					{@const anulado = payment.status === 'anulado'}
					<tr>
						<td>{formatDate(payment.date)}</td>
						<td>{payment.method || '—'}</td>
						<td>{payment.reference || '—'}</td>
						<td class="importe">{formatMoney(payment.amount)}</td>
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

<style>
	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
	}

	.importe {
		font-weight: 600;
		white-space: nowrap;
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
