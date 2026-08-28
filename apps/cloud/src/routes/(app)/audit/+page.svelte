<script>
	let { data } = $props();

	function formatDate(value) {
		if (!value) return '—';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-DO');
	}
</script>

<section class="panel">
	<div class="page-header">
		<h1>Auditoría</h1>
	</div>
	<p class="page-intro">Registro de acciones críticas. Solo lectura — no se pueden editar ni eliminar entradas.</p>

	<form class="filter-bar" method="GET">
		<input type="text" name="action" placeholder="Acción (ej. quote.approved)" value={data.action} />
		<input type="text" name="entityType" placeholder="Entidad (ej. quote)" value={data.entityType} />
		<input type="date" name="dateFrom" value={data.dateFrom} />
		<input type="date" name="dateTo" value={data.dateTo} />
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

	{#if data.logs.length === 0}
		<p class="empty-state">No hay registros de auditoría para los filtros seleccionados.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Usuario</th>
					<th>Acción</th>
					<th>Entidad</th>
					<th>Descripción</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs as log (log.id)}
					<tr>
						<td>{formatDate(log.created_at)}</td>
						<td>{log.user_name || log.user_email || log.user_id || 'Sistema'}</td>
						<td><code>{log.action}</code></td>
						<td>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
						<td>{log.description || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.page-intro {
		color: var(--muted);
		margin: 0 0 20px;
	}
	code {
		font-size: 0.85rem;
	}
</style>
