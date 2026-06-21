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
								<input type="number" name="qty_{item.id}" min="0" max={item.returnable} value="0" class="input-narrow" />
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
</style>
