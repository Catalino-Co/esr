<script>
	import { enhance } from '$app/forms';

	let { form } = $props();
	const values = form?.values ?? {};
</script>

<section class="panel">
	<div class="page-header">
		<h1>Nuevo cliente</h1>
		<a class="btn-secondary" href="/customers">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<form method="POST" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="name">Nombre *</label>
			<input id="name" name="name" value={values.name ?? ''} required />
			{#if form?.fieldErrors?.name}<span class="form-error">{form.fieldErrors.name}</span>{/if}
		</div>
		<div class="form-field">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" value={values.email ?? ''} />
			{#if form?.fieldErrors?.email}<span class="form-error">{form.fieldErrors.email}</span>{/if}
		</div>
		<div class="form-field">
			<label for="phone">Teléfono</label>
			<input id="phone" name="phone" value={values.phone ?? ''} />
		</div>
		<div class="form-field">
			<label for="document_id">Documento</label>
			<input id="document_id" name="document_id" value={values.document_id ?? ''} />
		</div>
		<div class="form-field">
			<label for="contact_person">Persona de contacto</label>
			<input id="contact_person" name="contact_person" value={values.contact_person ?? ''} />
		</div>
		<div class="form-field full">
			<label for="address">Dirección</label>
			<input id="address" name="address" value={values.address ?? ''} />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="3">{values.notes ?? ''}</textarea>
		</div>
		<div class="form-actions">
			<button type="submit" class="btn-primary">Crear cliente</button>
		</div>
	</form>
</section>
