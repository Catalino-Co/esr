<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const values = form?.values ?? {};
</script>

<section class="panel">
	<div class="page-header">
		<h1>Nuevo artículo</h1>
		<a class="btn-secondary" href="/inventory">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<form method="POST" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="name">Nombre *</label>
			<input id="name" name="name" value={values.name ?? ''} required />
		</div>
		<div class="form-field">
			<label for="internal_code">Código / SKU</label>
			<input id="internal_code" name="internal_code" value={values.internal_code ?? ''} />
		</div>
		<div class="form-field">
			<label for="category_id">Categoría</label>
			<select id="category_id" name="category_id">
				<option value="">Sin categoría</option>
				{#each data.categories as category (category.id)}
					<option value={category.id} selected={String(values.category_id) === String(category.id)}>
						{category.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="total_quantity">Cantidad total *</label>
			<input id="total_quantity" name="total_quantity" type="number" min="0" value={values.total_quantity ?? 0} />
		</div>
		<div class="form-field">
			<label for="rental_price">Precio alquiler</label>
			<input id="rental_price" name="rental_price" type="number" min="0" step="0.01" value={values.rental_price ?? 0} />
		</div>
		<div class="form-field">
			<label for="status">Estado</label>
			<select id="status" name="status">
				<option value="disponible">Disponible</option>
				<option value="mantenimiento">Mantenimiento</option>
			</select>
		</div>
		<div class="form-field full">
			<label for="description">Descripción</label>
			<textarea id="description" name="description" rows="3">{values.description ?? ''}</textarea>
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="2">{values.notes ?? ''}</textarea>
		</div>
		<div class="form-actions">
			<button type="submit" class="btn-primary">Crear artículo</button>
		</div>
	</form>
</section>
