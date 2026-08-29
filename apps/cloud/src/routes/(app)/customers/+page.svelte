<script>
	import { recordStateBadgeClass, recordStateLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { can } from '$lib/can';
	import { stateSelect } from '$lib/list-filters';

	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Clientes</h1>
		{#if can('customers.create')}
			<a class="btn-primary" href="/customers/new">Nuevo cliente</a>
		{/if}
	</div>

	<FilterBar
		search={{
			name: 'search',
			placeholder: 'Nombre, email o teléfono',
			value: data.search
		}}
		selects={[stateSelect(data.state)]}
	/>

	{#if data.customers.length === 0}
		<p class="empty-state">No hay clientes con este filtro.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Cliente</th>
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
							<span class="badge {recordStateBadgeClass(customer.is_active)}">
								{recordStateLabel(customer.is_active)}
							</span>
						</td>
						<td><a href="/customers/{customer.id}">Ver / editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
