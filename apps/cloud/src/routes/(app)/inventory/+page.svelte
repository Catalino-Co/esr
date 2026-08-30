<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre o código', value: data.search }}
		selects={[
			{
				name: 'category',
				label: 'Cualquier categoría',
				value: data.categoryId,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier categoría' },
					...data.categories.map((c) => ({ value: String(c.id), label: c.name }))
				]
			},
			businessSelect(data.status, 'Cualquier disponibilidad', [
				{ value: 'disponible', label: 'Disponible' },
				{ value: 'mantenimiento', label: 'Mantenimiento' }
			], '12rem'),
			stateSelect(data.state)
		]}
	>
		{#snippet actions()}
			{#if can('inventory.create')}
				<a class="btn-primary btn-new" href="/inventory/new">Nuevo artículo</a>
			{/if}
		{/snippet}
	</FilterBar>

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
						<td><a class="btn-edit" href="/inventory/{item.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
