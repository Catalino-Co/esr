<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Órdenes de trabajo</h1>
	</div>

	<form class="filter-bar" method="GET">
		<input type="search" name="search" placeholder="Buscar por cliente" value={data.search} />
		<select name="status">
			<option value="">Todos</option>
			<option value="confirmado" selected={data.status === 'confirmado'}>Confirmado</option>
			<option value="cerrado" selected={data.status === 'cerrado'}>Cerrado</option>
			<option value="cancelado" selected={data.status === 'cancelado'}>Cancelado</option>
		</select>
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

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
