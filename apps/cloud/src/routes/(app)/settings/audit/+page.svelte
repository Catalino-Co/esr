<script>
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	let { data } = $props();

	function formatDate(value) {
		if (!value) return '—';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-DO');
	}
</script>

<section class="panel">
	<p class="page-intro">Registro de acciones críticas. Solo lectura — no se pueden editar ni eliminar entradas.</p>

	<!-- Auditoria no tiene estado de circulacion: es un registro de solo
	     lectura. Recibe la misma barra con sus propios filtros. -->
	<FilterBar
		search={{ name: 'action', placeholder: 'Acción exacta (ej. quote.approved)', value: data.action }}
		selects={[
			{
				name: 'entityType',
				label: 'Cualquier entidad',
				value: data.entityType,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier entidad' },
					...data.entityTypes.map((entity) => ({ value: entity, label: entity }))
				]
			}
		]}
		dates={[
			{ name: 'dateFrom', label: 'Desde', value: data.dateFrom },
			{ name: 'dateTo', label: 'Hasta', value: data.dateTo }
		]}
	/>

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
