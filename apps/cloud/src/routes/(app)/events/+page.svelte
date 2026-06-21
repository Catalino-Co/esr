<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Eventos</h1>
		<a class="btn-primary" href="/events/new">Nuevo evento</a>
	</div>

	<form class="filter-bar" method="GET">
		<input type="search" name="search" placeholder="Buscar por título o lugar" value={data.search} />
		<select name="status">
			<option value="">Todos los estados</option>
			<option value="tentativo" selected={data.status === 'tentativo'}>Tentativo</option>
			<option value="confirmado" selected={data.status === 'confirmado'}>Confirmado</option>
			<option value="completado" selected={data.status === 'completado'}>Completado</option>
			<option value="cancelado" selected={data.status === 'cancelado'}>Cancelado</option>
		</select>
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

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
