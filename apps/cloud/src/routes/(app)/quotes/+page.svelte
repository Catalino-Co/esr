<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect } from '$lib/list-filters';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<!--
		Un solo eje de estado, y es el de NEGOCIO.

		Aquí había además el select de circulación —Activos, Inactivos,
		Archivados— y no significaba nada: ninguna pantalla de Cloud cambia el
		`is_active` de una cotización, así que solo podía valer 1 y el filtro no
		filtraba nada. Y aunque hubiera funcionado, sobraría igual: una cotización
		se retira cancelándola, que es el vocabulario que el cliente entiende.
	-->
	<FilterBar
		search={{ name: 'search', placeholder: 'Número, cliente o evento', value: data.search }}
		selects={[
			businessSelect(data.status, 'Cualquier estado', [
				{ value: 'borrador', label: 'Borrador' },
				{ value: 'aprobada', label: 'Aprobada' },
				{ value: 'cancelada', label: 'Cancelada' },
				{ value: 'convertida', label: 'Convertida' }
			])
		]}
	>
		{#snippet actions()}
			{#if can('quotes.create')}
				<a class="btn-primary btn-new" href="/quotes/new">Nueva cotización</a>
			{/if}
		{/snippet}
	</FilterBar>

	{#if data.quotes.length === 0}
		<p class="empty-state">No hay cotizaciones.</p>
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
				{#each data.quotes as quote (quote.id)}
					<tr>
						<td>{quote.quote_number || `#${quote.id}`}</td>
						<td>{quote.client_name}</td>
						<td>{quote.event_name}</td>
						<td>{quote.status}</td>
						<td>{Number(quote.total || 0).toFixed(2)}</td>
						<td><a class="btn-view" href="/quotes/{quote.id}">Ver</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
