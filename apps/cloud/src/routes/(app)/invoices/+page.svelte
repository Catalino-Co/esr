<script>
	import { formatDate, formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';

	let { data } = $props();

	/**
	 * El saldo se calcula aquí y no en el servidor porque el listado ya trae
	 * total y cobrado: pedirle una tercera columna al SQL sería repetir una
	 * resta que el navegador hace igual de bien.
	 *
	 * Una factura anulada devuelve `null`, no cero: cero se pinta «Saldada» y
	 * eso diría que se cobró, cuando lo que pasa es que ya no se debe nada
	 * porque el documento no existe a efectos de cobro.
	 */
	function saldo(invoice) {
		if (invoice.status === 'anulada') return null;
		const pendiente = Number(invoice.total ?? 0) - Number(invoice.paid ?? 0);
		return pendiente > 0 ? pendiente : 0;
	}
</script>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Número de factura o cliente', value: data.search }}
		selects={[
			businessSelect(data.status, 'Cualquier estado', [
				{ value: 'emitida', label: 'Emitida' },
				{ value: 'anulada', label: 'Anulada' }
			]),
			stateSelect(data.state)
		]}
	>
		{#snippet actions()}
			{#if can('invoices.create')}
				<a class="btn-primary btn-new" href="/invoices/new">Nueva factura</a>
			{/if}
		{/snippet}
	</FilterBar>

	{#if data.invoices.length === 0}
		<p class="empty-state">No hay facturas con este filtro.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Número</th>
					<th>Cliente</th>
					<th>Orden</th>
					<th>Fecha</th>
					<th class="num">Total</th>
					<th class="num">Saldo</th>
					<th>Estado</th>
				</tr>
			</thead>
			<tbody>
				{#each data.invoices as invoice (invoice.id)}
					{@const pendiente = saldo(invoice)}
					<tr>
						<td><a href="/invoices/{invoice.id}">{invoice.invoice_number}</a></td>
						<td>{invoice.client_name || '—'}</td>
						<td>
							{#if invoice.work_order_id}
								<a href="/work-orders/{invoice.work_order_id}">
									{invoice.order_number || `#${invoice.work_order_id}`}
								</a>
							{:else}
								—
							{/if}
						</td>
						<td>{formatDate(invoice.date)}</td>
						<td class="num">{formatMoney(invoice.total)}</td>
						<td class="num" class:saldado={pendiente === 0}>
							{#if pendiente === null}
								<span class="text-muted">—</span>
							{:else if pendiente === 0}
								Saldada
							{:else}
								{formatMoney(pendiente)}
							{/if}
						</td>
						<td>
							<span class="badge {statusBadgeClass(invoice.status)}">
								{statusLabel(invoice.status)}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.num {
		text-align: right;
		white-space: nowrap;
	}

	.saldado {
		color: var(--success-text);
	}

	.text-muted {
		color: var(--text-secondary);
	}
</style>
