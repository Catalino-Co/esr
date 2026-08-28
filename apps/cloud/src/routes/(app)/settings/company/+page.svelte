<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const values = $derived(form?.values ?? data.settings);
</script>

<section class="panel">
	<div class="page-header">
		<h1>Datos de la empresa</h1>
		<a class="btn-secondary" href="/settings">Volver</a>
	</div>

	<p class="panel-hint">
		Esta información encabeza las cotizaciones, órdenes, conduces y checklists imprimibles.
	</p>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<form method="POST" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="name">Nombre comercial *</label>
			<input id="name" name="name" value={values.name ?? ''} required />
			{#if form?.fieldErrors?.name}<span class="form-error">{form.fieldErrors.name}</span>{/if}
		</div>
		<div class="form-field">
			<label for="rnc">RNC</label>
			<input id="rnc" name="rnc" value={values.rnc ?? ''} />
		</div>
		<div class="form-field">
			<label for="phone">Teléfono</label>
			<input id="phone" name="phone" value={values.phone ?? ''} />
		</div>
		<div class="form-field">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" value={values.email ?? ''} />
			{#if form?.fieldErrors?.email}<span class="form-error">{form.fieldErrors.email}</span>{/if}
		</div>
		<div class="form-field full">
			<label for="address">Dirección</label>
			<input id="address" name="address" value={values.address ?? ''} />
		</div>
		<div class="form-field full">
			<button type="submit" class="btn-primary">Guardar cambios</button>
		</div>
	</form>
</section>
