<script>
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Incidencias — Orden {data.order.order_number || `#${data.order.id}`}</h1>
		<a class="btn-secondary" href="/work-orders/{data.order.id}">Volver</a>
	</div>

	{#if form?.success}
		<div class="alert-success" role="status">Operación completada.</div>
	{/if}
	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	{#if can('incidents.create')}
	<h2>Registrar incidencia</h2>
	<form method="POST" action="?/create" use:enhance class="form-grid" style="margin-bottom: 24px">
		<label>
			Tipo
			<select name="type" required>
				<option value="daño">Daño</option>
				<option value="faltante">Faltante / pérdida</option>
				<option value="nota">Nota operativa</option>
				<option value="otro">Otro</option>
			</select>
		</label>
		<label>
			Severidad
			<select name="severity">
				<option value="baja">Baja</option>
				<option value="media" selected>Media</option>
				<option value="alta">Alta</option>
				<option value="critica">Crítica</option>
			</select>
		</label>
		<label>
			Artículo (opcional)
			<select name="item_id">
				<option value="">— Ninguno —</option>
				{#each data.items as item (item.id)}
					<option value={item.item_id}>{item.name}</option>
				{/each}
			</select>
		</label>
		<label>
			Costo estimado
			<input type="number" name="estimated_cost" min="0" step="0.01" value="0" />
		</label>
		<label class="full-width">
			Descripción
			<textarea name="description" rows="3" required></textarea>
		</label>
		<div class="full-width">
			<button type="submit" class="btn-primary">Crear incidencia</button>
		</div>
	</form>
	{/if}

	<h2>Listado</h2>
	{#if data.incidents.length === 0}
		<p class="empty-state">Sin incidencias registradas.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Tipo</th><th>Severidad</th><th>Estado</th><th>Descripción</th><th>Costo</th><th></th></tr>
			</thead>
			<tbody>
				{#each data.incidents as incident (incident.id)}
					<tr>
						<td>{incident.type}</td>
						<td>{incident.severity || '—'}</td>
						<td>{incident.status}</td>
						<td>{incident.description}</td>
						<td>{Number(incident.estimated_cost || 0).toFixed(2)}</td>
						<td>
							<a class="btn-link" href="/incidents/{incident.id}/print" target="_blank" rel="noopener">Imprimir</a>
							{#if incident.status !== 'resuelto' && incident.status !== 'anulado' && can('incidents.resolve')}
								<form method="POST" action="?/resolve" use:enhance style="display:inline">
									<input type="hidden" name="incident_id" value={incident.id} />
									<button type="submit" class="btn-secondary btn-sm">Resolver</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.full-width { grid-column: 1 / -1; }
	.btn-sm { font-size: 0.85rem; padding: 4px 8px; }
	.btn-link {
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		text-decoration: none;
		margin-right: 8px;
	}
</style>
