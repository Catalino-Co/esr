<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Órdenes de trabajo</h1>
	</div>

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
	/>

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
						<td>{order.status}</td>
						<td>{Number(order.total || 0).toFixed(2)}</td>
						<td><a href="/work-orders/{order.id}">Ver</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
