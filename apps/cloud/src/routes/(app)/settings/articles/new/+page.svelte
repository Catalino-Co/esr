<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const values = form?.values ?? {};
</script>

<section class="panel">
	<div class="page-header">
		<h1>Nuevo artículo</h1>
		<a class="btn-secondary" href="/settings/articles">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<p class="panel-hint">
		Nace sin existencias. Para darle stock, regístrele una entrada en
		<a href="/inventory">Inventario</a>: así queda constancia de a qué almacén entró, a
		qué costo y quién la registró.
	</p>

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
		<!-- Las dos tarifas VIGENTES: cada transacción copiará la suya. -->
		<div class="form-field">
			<label for="rental_price">Precio de alquiler</label>
			<input id="rental_price" name="rental_price" type="number" min="0" step="any" value={values.rental_price ?? 0} />
		</div>
		<div class="form-field">
			<label for="internal_cost">Precio de compra</label>
			<input id="internal_cost" name="internal_cost" type="number" min="0" step="any" value={values.internal_cost ?? 0} />
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
