<script>
	let { data } = $props();

	const statuses = [
		'confirmado',
		'en_preparacion',
		'entregado',
		'parcialmente_devuelto',
		'devuelto',
		'cerrado',
		'cancelado'
	];
</script>

<section class="panel">
	<div class="page-header">
		<h1>Reporte — Órdenes</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/reports">Volver</a>
			<a class="btn-secondary" href="/reports/orders.csv?{new URLSearchParams({ search: data.search, status: data.status, dateFrom: data.dateFrom, dateTo: data.dateTo }).toString()}">Exportar CSV</a>
			<button type="button" class="btn-primary" onclick={() => window.print()}>Imprimir</button>
		</div>
	</div>

	<form class="filter-bar no-print" method="GET">
		<input type="search" name="search" placeholder="Buscar cliente" value={data.search} />
		<select name="status">
			<option value="">Todos los estados</option>
			{#each statuses as st}
				<option value={st} selected={data.status === st}>{st}</option>
			{/each}
		</select>
		<input type="date" name="dateFrom" value={data.dateFrom} />
		<input type="date" name="dateTo" value={data.dateTo} />
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

	{#if data.orders.length === 0}
		<p class="empty-state">Sin órdenes para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Número</th>
					<th>Cliente</th>
					<th>Evento</th>
					<th>Estado</th>
					<th>Fecha</th>
					<th>Total</th>
				</tr>
			</thead>
			<tbody>
				{#each data.orders as order (order.id)}
					<tr>
						<td>{order.order_number || `#${order.id}`}</td>
						<td>{order.client_name}</td>
						<td>{order.event_name}</td>
						<td>{order.status}</td>
						<td>{order.date || '—'}</td>
						<td>{Number(order.total || 0).toFixed(2)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.page-header-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	@media print {
		.no-print {
			display: none !important;
		}
	}
</style>
