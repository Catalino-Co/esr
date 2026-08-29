<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { businessSelect, stateSelect } from '$lib/list-filters';
	import { can } from '$lib/can';

	let { data } = $props();

	const money = (value) =>
		Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	const statusClass = (status) =>
		status === 'firmado' ? 'badge-success' : status === 'cancelado' ? 'badge-danger' : 'badge-muted';
</script>

<section class="panel">
	<div class="page-header">
		<h1>Contratos</h1>
		{#if can('contracts.create')}
			<a class="btn-primary" href="/quotes?status=aprobada">Generar desde cotización</a>
		{/if}
	</div>

	<FilterBar
		search={{ name: 'search', placeholder: 'Número o cliente', value: data.search }}
		selects={[
			businessSelect(data.status, 'Cualquier estado', [
				{ value: 'borrador', label: 'Borrador' },
				{ value: 'firmado', label: 'Firmado' },
				{ value: 'cancelado', label: 'Cancelado' }
			]),
			stateSelect(data.state)
		]}
	/>

	{#if data.contracts.length === 0}
		<p class="empty-state">
			No hay contratos. Se generan desde una cotización aprobada, en su página de detalle.
		</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Número</th>
					<th>Cliente</th>
					<th>Cotización</th>
					<th>Estado</th>
					<th class="num">Total</th>
					<th class="num">Cobrado</th>
					<th class="num">Saldo</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.contracts as contract (contract.id)}
					<tr>
						<td>{contract.number || `#${contract.id}`}</td>
						<td>{contract.client_name || '—'}</td>
						<td>{contract.quote_number || '—'}</td>
						<td>
							<span class="badge {statusClass(contract.status)}">{contract.status}</span>
						</td>
						<td class="num">{money(contract.summary.total)}</td>
						<td class="num">{money(contract.summary.paid)}</td>
						<td class="num" class:saldado={contract.summary.settled}>
							{contract.summary.settled ? 'Saldado' : money(contract.summary.balance)}
						</td>
						<td><a href="/contracts/{contract.id}">Ver</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.num {
		text-align: right;
		white-space: nowrap;
	}

	.saldado {
		color: var(--text-success);
		font-weight: 600;
	}
</style>
