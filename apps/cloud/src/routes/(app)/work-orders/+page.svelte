<script>
	import { formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Cliente o responsable', value: data.search }}
		selects={[
			businessSelect(data.status, 'Cualquier estado', [
				{ value: 'confirmado', label: 'Confirmado' },
				{ value: 'en_preparacion', label: 'En preparación' },
				{ value: 'entregado', label: 'Entregado' },
				{ value: 'devuelto', label: 'Devuelto' },
				{ value: 'cerrado', label: 'Cerrado' },
				{ value: 'cancelado', label: 'Cancelado' }
			]),
			stateSelect(data.state)
		]}
	>
		{#snippet actions()}
			{#if can('work_orders.create')}
				<a class="btn-primary btn-new" href="/work-orders/new">Nueva orden</a>
			{/if}
		{/snippet}
	</FilterBar>

	{#if data.orders.length === 0}
		<p class="empty-state">No hay órdenes.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Número</th>
					<th>Cliente</th>
					<th>Evento</th>
					<th>Estado</th>
					<th>Total</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.orders as order (order.id)}
					<tr>
						<td>{order.order_number || `#${order.id}`}</td>
						<td>{order.client_name}</td>
						<td>{order.event_name}</td>
						<td>
							<span class="badge {statusBadgeClass(order.status)}">{statusLabel(order.status)}</span>
						</td>
						<td class="num">{formatMoney(order.total)}</td>
						<td><a class="btn-view" href="/work-orders/{order.id}">Ver</a></td>
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
</style>
