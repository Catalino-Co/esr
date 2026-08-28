<script>
	import { can } from '$lib/can';
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Clientes</h1>
		<div class="page-actions">
			{#if can('customers.create')}
				<a class="btn-primary" href="/customers/new">Nuevo cliente</a>
			{/if}
		</div>
	</div>

	<form class="filter-bar" method="GET">
		<input type="search" name="search" placeholder="Buscar por nombre, email o teléfono" value={data.search} />
		<select name="status" value={data.status}>
			<option value="all" selected={data.status === 'all'}>Todos</option>
			<option value="active" selected={data.status === 'active'}>Activos</option>
			<option value="inactive" selected={data.status === 'inactive'}>Inactivos</option>
		</select>
		<button type="submit" class="btn-secondary">Buscar</button>
	</form>

	{#if data.customers.length === 0}
		<p class="empty-state">No hay clientes para mostrar.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Nombre</th>
					<th>Email</th>
					<th>Teléfono</th>
					<th>Estado</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.customers as customer (customer.id)}
					<tr>
						<td>{customer.name}</td>
						<td>{customer.email || '—'}</td>
						<td>{customer.phone || '—'}</td>
						<td>
							<span class="badge {customer.is_active ? 'badge-active' : 'badge-inactive'}">
								{customer.is_active ? 'Activo' : 'Inactivo'}
							</span>
						</td>
						<td><a href="/customers/{customer.id}">Ver / editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
