<script>
	import { enhance } from '$app/forms';
	import { formatDate, statusBadgeClass, statusLabel } from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	/**
	 * Solo una ENTREGA se factura. Sin esto, la nota de una devolución invitaba
	 * a emitir su factura, que es justo lo que no debe existir.
	 */
	const facturable = $derived(data.conduce.conduce_type !== 'devolucion');
	const esDevolucion = $derived(data.conduce.conduce_type === 'devolucion');
	const anulado = $derived(!data.anulable);

	let anulando = $state(false);
	let modo = $state('documento');
	let errorAnular = $state(null);

	function abrirAnulacion() {
		modo = 'documento';
		errorAnular = null;
		anulando = true;
	}

	function cerrarAnulacion() {
		anulando = false;
		errorAnular = null;
	}

	const alAnular = () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrarAnulacion();
			return;
		}
		errorAnular = result.data?.error ?? 'No se pudo anular el conduce.';
	};

	const accion = $derived(esDevolucion ? 'la devolución' : 'la entrega');
</script>

<section class="panel">
	<div class="page-header">
		<h1>Conduce {data.conduce.note_number || `#${data.conduce.id}`}</h1>
		<div class="page-header-actions">
			{#if data.anulable && can('conduces.cancel')}
				<button type="button" class="btn-danger" onclick={abrirAnulacion}>Anular conduce</button>
			{/if}
			<a class="btn-secondary" href="/conduces/{data.conduce.id}/print" target="_blank" rel="noopener">
				Imprimir conduce
			</a>
			<a class="btn-secondary" href="/work-orders/{data.conduce.work_order_id}">Volver a la orden</a>
		</div>
	</div>

	{#if !anulando}
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
		<div class="metric">
			<strong>
				{#if data.invoice}
					<a href="/invoices/{data.invoice.id}">{data.invoice.invoice_number}</a>
				{:else}
					<span class="sin-facturar">{facturable ? 'Sin facturar' : 'No se factura'}</span>
				{/if}
			</strong>
			<span>Factura</span>
		</div>
		<div class="metric"><strong>{data.conduce.received_by_name || '—'}</strong><span>Receptor</span></div>
	</div>

	{#if anulado}
		<div class="alert-error" role="status">
			Conduce anulado{data.conduce.cancelled_at ? ` el ${formatDate(data.conduce.cancelled_at)}` : ''}{data
				.conduce.cancel_reason
				? `: ${data.conduce.cancel_reason}`
				: ''}.
			{#if data.conduce.cancel_mode === 'operacion'}
				Se deshizo también {accion}.
			{:else}
				Solo se retiró el documento: {accion} sigue registrada en la orden.
			{/if}
		</div>
	{/if}

	{#if !data.invoice && facturable && !anulado && can('invoices.create')}
		<p class="panel-hint">
			Esta entrega todavía no se ha cobrado.
			<a href="/invoices/new?order={data.conduce.work_order_id}">Emitir su factura</a>.
		</p>
	{/if}

	{#if data.conduce.notes}
		<p><strong>Notas:</strong> {data.conduce.notes}</p>
	{/if}

	<h2 class="sec-title">Artículos</h2>
	<table class="data-table">
		<thead>
			<tr>
				<th>Artículo</th>
				<th>Código</th>
				<th>Cantidad</th>
				{#if esDevolucion}<th>Condición</th>{/if}
				<th>Estado</th>
			</tr>
		</thead>
		<tbody>
			{#each data.items as item (item.id)}
				<tr>
					<td>{item.name || item.item_id}</td>
					<td>{item.internal_code || '—'}</td>
					<td>{item.quantity}</td>
					{#if esDevolucion}
						<td>
							{#if item.return_condition}
								<span class="badge {statusBadgeClass(item.return_condition)}">
									{statusLabel(item.return_condition)}
								</span>
							{:else}
								<span class="sin-facturar">—</span>
							{/if}
						</td>
					{/if}
					<td>
						<span class="badge {statusBadgeClass(item.status)}">{statusLabel(item.status)}</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<Modal bind:open={anulando} size="sm" title="Anular conduce" onclose={cerrarAnulacion}>
	{#if errorAnular}
		<div class="alert-error" role="alert">{errorAnular}</div>
	{/if}

	<form id="anular-conduce" method="POST" action="?/cancel" class="form-grid" use:enhance={alAnular}>
		<!-- Los dos modos son cosas muy distintas, así que se eligen leyendo qué
		     pasa con cada uno, no marcando una casilla con un nombre técnico. -->
		<div class="form-field full">
			<label class="modo" class:modo-elegido={modo === 'documento'}>
				<input type="radio" name="mode" value="documento" bind:group={modo} />
				<span>
					<strong>Solo el documento</strong>
					{esDevolucion ? 'La devolución' : 'La entrega'} ocurrió; lo que se retira es el papel.
					Las cantidades, los seriales y el estado de la orden no se tocan.
				</span>
			</label>

			<label class="modo" class:modo-elegido={modo === 'operacion'}>
				<input type="radio" name="mode" value="operacion" bind:group={modo} />
				<span>
					<strong>Deshacer {accion}</strong>
					{esDevolucion ? 'La devolución' : 'La entrega'} no ocurrió. Vuelven atrás las cantidades,
					los seriales{esDevolucion ? ', las incidencias que generó' : ''} y el estado de la orden,
					y se escriben movimientos de stock que compensan los suyos.
				</span>
			</label>
		</div>

		<div class="form-field full">
			<label for="reason">Motivo *</label>
			<input id="reason" name="reason" required placeholder="Por qué se anula" />
		</div>
	</form>

	{#if modo === 'operacion'}
		<p class="panel-hint">
			Va todo en una sola transacción: o vuelve entero o no vuelve nada. Si algo no consta
			—qué unidades salieron, con qué condición volvieron— se rechaza en lugar de adivinar.
		</p>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarAnulacion}>Cancelar</button>
		<button type="submit" form="anular-conduce" class="btn-danger">Anular conduce</button>
	{/snippet}
</Modal>

<style>
	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
	}

	.sin-facturar {
		color: var(--text-secondary);
	}

	/* Cada modo es una tarjeta con su explicación: el nombre solo no basta
	   para distinguir retirar un papel de deshacer una entrega. */
	.modo {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		padding: var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 400;
	}

	.modo + .modo {
		margin-top: var(--sp-2);
	}

	.modo-elegido {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.modo strong {
		display: block;
		margin-bottom: 2px;
	}

	.modo input {
		margin-top: 3px;
		width: auto;
		flex: 0 0 auto;
	}
</style>
