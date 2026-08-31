<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Devolución — Orden {data.order.order_number || `#${data.order.id}`}</h1>
		<a class="btn-secondary" href="/work-orders/{data.order.id}">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	{#if data.items.length === 0}
		<p class="empty-state">No hay artículos pendientes de devolución.</p>
	{:else}
		<form method="POST" use:enhance>
			<table class="data-table">
				<thead>
					<tr><th>Artículo</th><th>Entregado pendiente</th><th>Cantidad</th><th>Condición</th><th>Notas</th></tr>
				</thead>
				<tbody>
					{#each data.items as item (item.id)}
						<tr>
							<td>{item.name}</td>
							<td>{item.returnable}</td>
							<td>
								{#if item.deliveredSerials.length > 0}
									<!-- Solo pueden volver las unidades que salieron con esta orden. -->
									<fieldset class="unidades">
										<legend class="unidades-legend">Marque las unidades que regresan</legend>
										{#each item.deliveredSerials as serial (serial.id)}
											<label class="unidad">
												<input type="checkbox" name="serial_{item.id}" value={serial.id} />
												<span>{serial.serial_number}</span>
											</label>
										{/each}
									</fieldset>
								{:else}
									<input type="number" name="qty_{item.id}" min="0" max={item.returnable} value="0" class="input-narrow" />
								{/if}
							</td>
							<td>
								<select name="condition_{item.id}">
									<option value="good">Bueno</option>
									<option value="fair">Regular</option>
									<option value="damaged">Dañado</option>
									<option value="lost">Perdido</option>
								</select>
							</td>
							<td><input type="text" name="notes_{item.id}" placeholder="Opcional" /></td>
						</tr>
					{/each}
				</tbody>
			</table>

			<label class="block-label" style="margin-top: 16px">
				Notas generales
				<textarea name="notes" rows="3"></textarea>
			</label>

			<div class="page-actions" style="margin-top: 16px">
				<button type="submit" class="btn-primary">Completar devolución</button>
			</div>
		</form>
	{/if}
</section>

<style>
	.input-narrow { width: 100px; }
	.block-label { display: block; }

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
</style>
