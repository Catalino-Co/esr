<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Checklists — Orden {data.order.order_number || `#${data.order.id}`}</h1>
		<a class="btn-secondary" href="/work-orders/{data.order.id}">Volver</a>
	</div>

	{#if form?.success}
		<div class="alert-success" role="status">Checklist {form.type} guardado.</div>
	{/if}
	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<h2>Salida</h2>
	<form method="POST" action="?/saveOutbound" use:enhance>
		<table class="data-table">
			<thead>
				<tr><th>Artículo</th><th>Esperado</th><th>Confirmado</th><th>Dañado</th><th>Faltante</th><th>Notas</th></tr>
			</thead>
			<tbody>
				{#each data.outbound as item (item.item_id)}
					<tr>
						<td>{item.item_name || item.item_id}</td>
						<td>
							{item.expected_quantity}
							<input type="hidden" name="out_expected_{item.item_id}" value={item.expected_quantity} />
						</td>
						<td>
							<input type="number" name="out_actual_{item.item_id}" min="0" value={item.actual_quantity || item.expected_quantity} class="input-narrow" />
						</td>
						<td><input type="checkbox" name="out_damaged_{item.item_id}" checked={item.is_damaged} /></td>
						<td><input type="checkbox" name="out_missing_{item.item_id}" checked={item.is_missing} /></td>
						<td><input type="text" name="out_notes_{item.item_id}" value={item.notes || ''} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="page-actions" style="margin-top: 12px">
			<button type="submit" class="btn-primary">Guardar checklist de salida</button>
		</div>
	</form>

	<h2 style="margin-top: 32px">Retorno</h2>
	<form method="POST" action="?/saveReturn" use:enhance>
		<table class="data-table">
			<thead>
				<tr><th>Artículo</th><th>Esperado</th><th>Devuelto</th><th>Dañado</th><th>Faltante</th><th>Notas</th></tr>
			</thead>
			<tbody>
				{#each data.returnItems as item (item.item_id)}
					<tr>
						<td>{item.item_name || item.item_id}</td>
						<td>
							{item.expected_quantity}
							<input type="hidden" name="ret_expected_{item.item_id}" value={item.expected_quantity} />
						</td>
						<td>
							<input type="number" name="ret_actual_{item.item_id}" min="0" value={item.actual_quantity} class="input-narrow" />
						</td>
						<td><input type="checkbox" name="ret_damaged_{item.item_id}" checked={item.is_damaged} /></td>
						<td><input type="checkbox" name="ret_missing_{item.item_id}" checked={item.is_missing} /></td>
						<td><input type="text" name="ret_notes_{item.item_id}" value={item.notes || ''} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="page-actions" style="margin-top: 12px">
			<button type="submit" class="btn-primary">Guardar checklist de retorno</button>
		</div>
	</form>
</section>

<style>
	.input-narrow { width: 100px; }
</style>
