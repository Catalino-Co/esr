<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const { quote, items, canEdit } = data;
</script>

<section class="panel">
	<div class="page-header">
		<h1>Cotización {quote.quote_number || `#${quote.id}`}</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/quotes/{quote.id}/print" target="_blank" rel="noopener">Imprimir</a>
			<a class="btn-secondary" href="/quotes">Volver</a>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<p class="badge badge-active">Actualizado.</p>
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{data.customer?.name ?? '—'}</strong><span>Cliente</span></div>
		<div class="metric"><strong>{data.event?.name ?? '—'}</strong><span>Evento</span></div>
		<div class="metric"><strong>{quote.status}</strong><span>Estado</span></div>
		<div class="metric"><strong>{Number(quote.total || 0).toFixed(2)}</strong><span>Total</span></div>
	</div>

	{#if data.linkedOrder}
		<p>Orden generada: <a href="/work-orders/{data.linkedOrder.id}">{data.linkedOrder.order_number || `#${data.linkedOrder.id}`}</a></p>
	{/if}

	<h2>Artículos</h2>
	{#if items.length === 0}
		<p class="empty-state">Sin artículos todavía.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Artículo</th><th>Código</th><th>Cant.</th><th>Precio</th><th>Total</th><th></th></tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					<tr>
						<td>{item.name}</td>
						<td>{item.code || '—'}</td>
						<td>{item.quantity}</td>
						<td>{Number(item.price).toFixed(2)}</td>
						<td>{Number(item.total || 0).toFixed(2)}</td>
						<td>
							{#if canEdit}
								<form method="POST" action="?/removeItem" use:enhance style="display:inline">
									<input type="hidden" name="itemId" value={item.id} />
									<button type="submit" class="btn-link">Quitar</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if canEdit}
		<h3 style="margin-top: 24px">Agregar artículo</h3>
		<form method="POST" action="?/addItem" class="form-grid" use:enhance>
			<div class="form-field">
				<label for="item_id">Artículo</label>
				<select id="item_id" name="item_id" required>
					{#each data.inventory as inv (inv.id)}
						<option value={inv.id}>{inv.name} ({inv.internal_code || 'sin código'})</option>
					{/each}
				</select>
			</div>
			<div class="form-field">
				<label for="quantity">Cantidad</label>
				<input id="quantity" name="quantity" type="number" min="1" value="1" required />
			</div>
			<div class="form-field">
				<label for="price">Precio unitario</label>
				<input id="price" name="price" type="number" min="0" step="0.01" value="0" required />
			</div>
			<div class="form-field">
				<button type="submit" class="btn-primary">Agregar</button>
			</div>
		</form>

		<h3 style="margin-top: 24px">Totales y notas</h3>
		<form method="POST" action="?/updateQuote" class="form-grid" use:enhance>
			<div class="form-field"><span class="form-field-label">Subtotal</span><input value={Number(quote.subtotal || 0).toFixed(2)} readonly /></div>
			<div class="form-field"><label for="discount">Descuento</label><input id="discount" name="discount" type="number" min="0" step="0.01" value={quote.discount ?? 0} /></div>
			<div class="form-field"><label for="tax_amount">Impuesto</label><input id="tax_amount" name="tax_amount" type="number" min="0" step="0.01" value={quote.tax_amount ?? 0} /></div>
			<div class="form-field full"><label for="notes">Notas</label><textarea id="notes" name="notes" rows="2">{quote.notes ?? ''}</textarea></div>
			<div class="form-field"><button type="submit" class="btn-secondary">Recalcular / guardar</button></div>
		</form>

		<div class="page-actions" style="margin-top: 20px">
			{#if quote.status !== 'aprobada' && quote.status !== 'convertida'}
				<form method="POST" action="?/approve" use:enhance><button type="submit" class="btn-primary">Aprobar cotización</button></form>
			{/if}
			{#if quote.status === 'aprobada'}
				<form method="POST" action="?/convert" use:enhance><button type="submit" class="btn-primary">Convertir a orden</button></form>
			{/if}
			<form method="POST" action="?/cancel" use:enhance><button type="submit" class="btn-danger">Cancelar cotización</button></form>
		</div>
	{/if}
</section>

<style>
	.btn-link {
		background: none;
		border: none;
		color: var(--danger);
		cursor: pointer;
	}
</style>
