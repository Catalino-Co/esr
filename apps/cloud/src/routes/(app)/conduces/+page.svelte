<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { stateSelect } from '$lib/list-filters';

	let { data } = $props();
</script>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Número de conduce', value: data.search }}
		selects={[
			{
				name: 'type',
				label: 'Cualquier tipo',
				value: data.type,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier tipo' },
					{ value: 'entrega', label: 'Entrega' },
					{ value: 'devolucion', label: 'Devolución' }
				]
			},
			stateSelect(data.state)
		]}
	/>

	{#if data.conduces.length === 0}
		<p class="empty-state">Sin conduces registrados.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Número</th><th>Orden</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr>
			</thead>
			<tbody>
				{#each data.conduces as conduce (conduce.id)}
					<tr>
						<td><a href="/conduces/{conduce.id}">{conduce.note_number || `#${conduce.id}`}</a></td>
						<td><a href="/work-orders/{conduce.work_order_id}">#{conduce.work_order_id}</a></td>
						<td>{conduce.conduce_type}</td>
						<td>{conduce.status}</td>
						<td>{conduce.date || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
