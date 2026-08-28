<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Reporte — Inventario</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/reports">Volver</a>
			<a class="btn-secondary" href="/reports/inventory.csv?{new URLSearchParams({ search: data.search, status: data.status, category: data.category }).toString()}">Exportar CSV</a>
			<button type="button" class="btn-primary" onclick={() => window.print()}>Imprimir</button>
		</div>
	</div>

	<form class="filter-bar no-print" method="GET">
		<input type="search" name="search" placeholder="Buscar" value={data.search} />
		<select name="status">
			<option value="">Todos los estados</option>
			<option value="disponible" selected={data.status === 'disponible'}>Disponible</option>
			<option value="mantenimiento" selected={data.status === 'mantenimiento'}>Mantenimiento</option>
		</select>
		<select name="category">
			<option value="">Todas las categorías</option>
			{#each data.categories as cat (cat.id)}
				<option value={cat.id} selected={String(data.category) === String(cat.id)}>{cat.name}</option>
			{/each}
		</select>
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

	{#if data.items.length === 0}
		<p class="empty-state">Sin artículos para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Artículo</th>
					<th>SKU</th>
					<th>Categoría</th>
					<th>Total</th>
					<th>Disponible</th>
					<th>Comprometido</th>
					<th>Estado</th>
				</tr>
			</thead>
			<tbody>
				{#each data.items as item (item.id)}
					<tr>
						<td>{item.name}</td>
						<td>{item.internal_code || '—'}</td>
						<td>{item.category_name}</td>
						<td>{item.total_quantity ?? 0}</td>
						<td>{item.available_quantity ?? 0}</td>
						<td>{item.committed_quantity}</td>
						<td>{item.status || '—'}</td>
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
