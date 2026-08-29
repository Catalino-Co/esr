<script>
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

	<form class="filter-bar" method="GET">
		<input type="search" name="search" placeholder="Buscar por número o cliente" value={data.search} />
		<select name="status" value={data.status}>
			<option value="">Todos</option>
			<option value="borrador">Borrador</option>
			<option value="firmado">Firmado</option>
			<option value="cancelado">Cancelado</option>
		</select>
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

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
