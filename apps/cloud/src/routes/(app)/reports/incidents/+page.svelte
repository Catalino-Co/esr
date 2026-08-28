<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Reporte — Incidencias</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/reports">Volver</a>
			<a class="btn-secondary" href="/reports/incidents.csv?{new URLSearchParams({ status: data.status, severity: data.severity, type: data.type, dateFrom: data.dateFrom, dateTo: data.dateTo }).toString()}">Exportar CSV</a>
			<button type="button" class="btn-primary" onclick={() => window.print()}>Imprimir</button>
		</div>
	</div>

	<form class="filter-bar no-print" method="GET">
		<select name="status">
			<option value="">Todos los estados</option>
			<option value="reportado" selected={data.status === 'reportado'}>Reportado</option>
			<option value="en_revision" selected={data.status === 'en_revision'}>En revisión</option>
			<option value="resuelto" selected={data.status === 'resuelto'}>Resuelto</option>
			<option value="cancelado" selected={data.status === 'cancelado'}>Cancelado</option>
		</select>
		<select name="severity">
			<option value="">Todas las severidades</option>
			<option value="baja" selected={data.severity === 'baja'}>Baja</option>
			<option value="media" selected={data.severity === 'media'}>Media</option>
			<option value="alta" selected={data.severity === 'alta'}>Alta</option>
			<option value="critica" selected={data.severity === 'critica'}>Crítica</option>
		</select>
		<input type="text" name="type" placeholder="Tipo" value={data.type} />
		<input type="date" name="dateFrom" value={data.dateFrom} />
		<input type="date" name="dateTo" value={data.dateTo} />
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

	{#if data.incidents.length === 0}
		<p class="empty-state">Sin incidencias para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Tipo</th>
					<th>Severidad</th>
					<th>Estado</th>
					<th>Orden</th>
					<th>Artículo</th>
					<th>Descripción</th>
					<th>Costo est.</th>
					<th>Fecha</th>
				</tr>
			</thead>
			<tbody>
				{#each data.incidents as incident (incident.id)}
					<tr>
						<td>{incident.type}</td>
						<td>{incident.severity}</td>
						<td>{incident.status}</td>
						<td>{incident.order_label}</td>
						<td>{incident.item_name}</td>
						<td>{incident.short_description || '—'}</td>
						<td>{Number(incident.estimated_cost || 0).toFixed(2)}</td>
						<td>{incident.date || incident.created_at?.slice(0, 10) || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.page-header-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	@media print {
		.no-print {
			display: none !important;
		}
	}
</style>
