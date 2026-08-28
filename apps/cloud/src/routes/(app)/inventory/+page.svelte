<script>
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Inventario</h1>
		{#if can('inventory.create')}
			<a class="btn-primary" href="/inventory/new">Nuevo artículo</a>
		{/if}
	</div>

	<form class="filter-bar" method="GET">
		<input type="search" name="search" placeholder="Buscar por nombre o código" value={data.search} />
		<select name="status">
			<option value="">Todos los estados</option>
			<option value="disponible" selected={data.status === 'disponible'}>Disponible</option>
			<option value="mantenimiento" selected={data.status === 'mantenimiento'}>Mantenimiento</option>
		</select>
		<button type="submit" class="btn-secondary">Buscar</button>
	</form>

	{#if data.items.length === 0}
		<p class="empty-state">No hay artículos para mostrar.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Nombre</th>
					<th>Código</th>
					<th>Categoría</th>
					<th>Total</th>
					<th>Disponible</th>
					<th>Estado</th>
					<th></th>
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
						<td>{item.status || '—'}</td>
						<td><a href="/inventory/{item.id}">Ver / editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
