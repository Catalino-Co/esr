<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { stateSelect } from '$lib/list-filters';
	import { formatMoney, statusLabel } from '@esr/core';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<p class="panel-hint">
		Qué artículos existen y cómo se describen. Cuánto hay de cada uno y dónde está se ve en
		<a href="/inventory">Inventario</a>.
	</p>

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
			stateSelect(data.state)
		]}
	>
		{#snippet actions()}
			{#if can('inventory.create')}
				<a class="btn-primary btn-new" href="/settings/articles/new">Nuevo artículo</a>
			{/if}
		{/snippet}
	</FilterBar>

	{#if data.items.length === 0}
		<p class="empty-state">No hay artículos para mostrar.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Código</th>
					<th>Nombre</th>
					<th>Categoría</th>
					<th>Unidad</th>
					<th>Proveedor</th>
					<th class="num">Mínimo</th>
					<th class="num">Precio</th>
					<th>Estado</th>
					<th><span class="sr-only">Acciones</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.items as item (item.id)}
					<tr>
						<td>{item.internal_code || '—'}</td>
						<td>{item.name}</td>
						<td>{item.category_name}</td>
						<td>{item.uom_abbr || '—'}</td>
						<td>{item.supplier_name}</td>
						<td class="num">{item.min_stock ?? 0}</td>
						<td class="num">{formatMoney(item.rental_price ?? 0)}</td>
						<td>{statusLabel(item.status)}</td>
						<td><a class="btn-edit" href="/settings/articles/{item.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.num {
		text-align: right;
	}
</style>
