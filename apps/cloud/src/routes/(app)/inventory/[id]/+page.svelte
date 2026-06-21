<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const item = data.item;
</script>

<section class="panel">
	<div class="page-header">
		<h1>{item.name}</h1>
		<a class="btn-secondary" href="/inventory">Volver al listado</a>
	</div>

	{#if form?.success}
		<p class="badge badge-active">Cambios guardados.</p>
	{/if}
	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	{#if data.availability}
		<div class="grid" style="margin-bottom: 16px">
			<div class="metric">
				<strong>{data.availability.total_quantity ?? item.total_quantity ?? 0}</strong>
				<span>Cantidad total</span>
			</div>
			<div class="metric">
				<strong>{data.availability.available_quantity ?? item.available_quantity ?? 0}</strong>
				<span>Disponible (sin reservas activas)</span>
			</div>
			<div class="metric">
				<strong>{data.availability.committed_quantity ?? 0}</strong>
				<span>Comprometida en órdenes</span>
			</div>
		</div>
	{/if}

	<form method="POST" action="?/update" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="name">Nombre *</label>
			<input id="name" name="name" value={item.name} required />
		</div>
		<div class="form-field">
			<label for="internal_code">Código / SKU</label>
			<input id="internal_code" name="internal_code" value={item.internal_code ?? ''} />
		</div>
		<div class="form-field">
			<label for="category_id">Categoría</label>
			<select id="category_id" name="category_id">
				<option value="">Sin categoría</option>
				{#each data.categories as category (category.id)}
					<option value={category.id} selected={String(item.category_id) === String(category.id)}>
						{category.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="total_quantity">Cantidad total *</label>
			<input id="total_quantity" name="total_quantity" type="number" min="0" value={item.total_quantity ?? 0} />
		</div>
		<div class="form-field">
			<label for="rental_price">Precio alquiler</label>
			<input id="rental_price" name="rental_price" type="number" min="0" step="0.01" value={item.rental_price ?? 0} />
		</div>
		<div class="form-field">
			<label for="status">Estado</label>
			<select id="status" name="status">
				<option value="disponible" selected={item.status === 'disponible'}>Disponible</option>
				<option value="mantenimiento" selected={item.status === 'mantenimiento'}>Mantenimiento</option>
			</select>
		</div>
		<div class="form-field full">
			<label for="description">Descripción</label>
			<textarea id="description" name="description" rows="3">{item.description ?? ''}</textarea>
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="2">{item.notes ?? ''}</textarea>
		</div>
		<div class="form-field full">
			<button type="submit" class="btn-primary">Guardar cambios</button>
		</div>
	</form>

	{#if item.is_active}
		<form method="POST" action="?/deactivate" style="margin-top: 16px" use:enhance>
			<button type="submit" class="btn-danger">Desactivar artículo</button>
		</form>
	{/if}
</section>
