<script>
	import RecordStateControl from '$lib/components/list/RecordStateControl.svelte';
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const customer = data.customer;
</script>

<section class="panel">
	<div class="page-header">
		<h1>{customer.name}</h1>
		<a class="btn-secondary" href="/customers">Volver al listado</a>
	</div>

	<RecordStateControl
		state={customer.is_active}
		editable={can('customers.archive')}
		noun="cliente"
	/>

	{#if form?.success}
		<p class="badge badge-active">Cambios guardados.</p>
	{/if}
	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<form method="POST" action="?/update" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="name">Nombre *</label>
			<input id="name" name="name" value={customer.name} required />
		</div>
		<div class="form-field">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" value={customer.email ?? ''} />
		</div>
		<div class="form-field">
			<label for="phone">Teléfono</label>
			<input id="phone" name="phone" value={customer.phone ?? ''} />
		</div>
		<div class="form-field">
			<label for="document_id">Documento</label>
			<input id="document_id" name="document_id" value={customer.document_id ?? ''} />
		</div>
		<div class="form-field">
			<label for="contact_person">Persona de contacto</label>
			<input id="contact_person" name="contact_person" value={customer.contact_person ?? ''} />
		</div>
		<div class="form-field full">
			<label for="address">Dirección</label>
			<input id="address" name="address" value={customer.address ?? ''} />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="3">{customer.notes ?? ''}</textarea>
		</div>
		<div class="form-field">
			<span class="badge {customer.is_active ? 'badge-active' : 'badge-inactive'}">
				{customer.is_active ? 'Activo' : 'Inactivo'}
			</span>
		</div>
		<div class="form-actions">
			{#if can('customers.update')}
				<button type="submit" class="btn-primary">Guardar cambios</button>
			{:else}
				<p class="panel-hint">Su rol no permite editar este registro.</p>
			{/if}
		</div>
	</form>

</section>
