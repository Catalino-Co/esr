<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
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
	>
		{#snippet actions()}
			{#if can('events.create')}
				<a class="btn-primary btn-new" href="/events/new">Nuevo evento</a>
			{/if}
		{/snippet}
	</FilterBar>

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
						<td><a class="btn-edit" href="/events/{event.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
