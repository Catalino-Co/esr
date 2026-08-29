<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Eventos</h1>
		{#if can('events.create')}
			<a class="btn-primary" href="/events/new">Nuevo evento</a>
		{/if}
	</div>

	<FilterBar
		search={{ name: 'search', placeholder: 'Título o lugar', value: data.search }}
		selects={[
			businessSelect(data.status, 'Cualquier estado', [
				{ value: 'tentativo', label: 'Tentativo' },
				{ value: 'confirmado', label: 'Confirmado' },
				{ value: 'completado', label: 'Completado' },
				{ value: 'cancelado', label: 'Cancelado' }
			]),
			stateSelect(data.state)
		]}
	/>

	{#if data.events.length === 0}
		<p class="empty-state">No hay eventos para mostrar.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Título</th>
					<th>Cliente</th>
					<th>Lugar</th>
					<th>Inicio</th>
					<th>Fin</th>
					<th>Estado</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.events as event (event.id)}
					<tr>
						<td>{event.name}</td>
						<td>{event.client_name}</td>
						<td>{event.location || '—'}</td>
						<td>{event.date || '—'}</td>
						<td>{event.pickup_date || event.date || '—'}</td>
						<td>{event.status || '—'}</td>
						<td><a href="/events/{event.id}">Ver / editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
