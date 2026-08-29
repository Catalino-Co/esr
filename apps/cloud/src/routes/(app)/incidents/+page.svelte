<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Incidencias</h1>
	</div>

	{#if data.incidents.length === 0}
		<p class="empty-state">Sin incidencias registradas.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Tipo</th><th>Orden</th><th>Severidad</th><th>Estado</th><th>Descripción</th><th></th></tr>
			</thead>
			<tbody>
				{#each data.incidents as incident (incident.id)}
					<tr>
						<td>{incident.type}</td>
						<td>
							{#if incident.work_order_id}
								<a href="/work-orders/{incident.work_order_id}/incidents">#{incident.work_order_id}</a>
							{:else}—{/if}
						</td>
						<td>{incident.severity || '—'}</td>
						<td>{incident.status}</td>
						<td>{incident.description}</td>
						<td><a class="btn-link" href="/incidents/{incident.id}/print" target="_blank" rel="noopener">Imprimir</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.btn-link {
		color: var(--text-brand);
		text-decoration: none;
		font-size: 0.9rem;
	}
</style>
