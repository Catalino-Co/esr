<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Cotizaciones</h1>
		{#if can('quotes.create')}
			<a class="btn-primary" href="/quotes/new">Nueva cotización</a>
		{/if}
	</div>

	<FilterBar
		search={{ name: 'search', placeholder: 'Número, cliente o evento', value: data.search }}
		selects={[
			businessSelect(data.status, 'Cualquier estado', [
				{ value: 'borrador', label: 'Borrador' },
				{ value: 'aprobada', label: 'Aprobada' },
				{ value: 'cancelada', label: 'Cancelada' },
				{ value: 'convertida', label: 'Convertida' }
			]),
			stateSelect(data.state)
		]}
	/>

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
						<td><a href="/quotes/{quote.id}">Ver</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
