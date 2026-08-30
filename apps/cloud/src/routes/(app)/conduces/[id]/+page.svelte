<script>
	import { statusBadgeClass, statusLabel } from '@esr/core';
	import { can } from '$lib/can';

	let { data } = $props();

	/**
	 * Solo una ENTREGA se factura. Sin esto, la nota de una devolución invitaba
	 * a emitir su factura, que es justo lo que no debe existir.
	 */
	const facturable = $derived(data.conduce.conduce_type !== 'devolucion');
</script>

<section class="panel">
	<div class="page-header">
		<h1>Conduce {data.conduce.note_number || `#${data.conduce.id}`}</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/conduces/{data.conduce.id}/print" target="_blank" rel="noopener">
				Imprimir conduce
			</a>
			<a class="btn-secondary" href="/work-orders/{data.conduce.work_order_id}">Volver a la orden</a>
		</div>
	</div>

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

	{#if !data.invoice && facturable && can('invoices.create')}
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

<style>
	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
	}

	.sin-facturar {
		color: var(--text-secondary);
	}
</style>
