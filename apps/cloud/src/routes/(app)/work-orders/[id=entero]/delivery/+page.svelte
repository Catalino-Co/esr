<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Entrega — Orden {data.order.order_number || `#${data.order.id}`}</h1>
		<a class="btn-secondary" href="/work-orders/{data.order.id}">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{data.customer?.name ?? '—'}</strong><span>Cliente</span></div>
		<div class="metric"><strong>{data.event?.name ?? '—'}</strong><span>Evento</span></div>
		<div class="metric"><strong>{data.order.status}</strong><span>Estado</span></div>
	</div>

	{#if data.items.length === 0}
		<p class="empty-state">No hay artículos pendientes de entrega.</p>
	{:else}
		<form method="POST" use:enhance>
			<table class="data-table">
				<thead>
					<tr><th>Artículo</th><th>Código</th><th>Pendiente</th><th>Cantidad a entregar</th></tr>
				</thead>
				<tbody>
					{#each data.items as item (item.id)}
						<tr>
							<td>{item.name}</td>
							<td>{item.internal_code || '—'}</td>
							<td>{item.deliverable}</td>
							<td>
								{#if item.serialized}
									<!-- En un artículo serializado la cantidad no se teclea: la
									     determinan las unidades que se marquen. -->
									{#if item.availableSerials.length === 0}
										<span class="sin-unidades">Sin unidades disponibles</span>
									{:else}
										<fieldset class="unidades">
											<legend class="unidades-legend">
												Marque hasta {item.deliverable} unidad(es)
											</legend>
											{#each item.availableSerials as serial (serial.id)}
												<label class="unidad">
													<input type="checkbox" name="serial_{item.id}" value={serial.id} />
													<span>{serial.serial_number}</span>
												</label>
											{/each}
										</fieldset>
									{/if}
								{:else}
									<input
										type="number"
										name="qty_{item.id}"
										min="0"
										max={item.deliverable}
										value={item.deliverable}
										class="input-narrow"
									/>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<div class="form-grid" style="margin-top: 20px">
				<label>
					Receptor (nombre)
					<input type="text" name="received_by_name" />
				</label>
				<label>
					Documento
					<input type="text" name="received_by_document" />
				</label>
				<label class="full-width">
					Notas
					<textarea name="notes" rows="3"></textarea>
				</label>
			</div>

			<div class="page-actions" style="margin-top: 16px">
				<button type="submit" class="btn-primary">Completar entrega</button>
			</div>
		</form>
	{/if}
</section>

<style>
	.input-narrow {
		width: 100px;
	}
	.full-width {
		grid-column: 1 / -1;
	}

	.unidades {
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		padding: var(--sp-2) var(--sp-3);
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-4);
		max-width: 420px;
	}

	.unidades-legend {
		font-size: var(--font-xs);
		color: var(--text-muted);
		padding: 0 var(--sp-1);
	}

	.unidad {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-size: var(--font-sm);
	}

	.sin-unidades {
		font-size: var(--font-sm);
		color: var(--text-warning);
	}
</style>
