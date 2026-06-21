<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const values = form?.values ?? {};
</script>

<section class="panel">
	<div class="page-header">
		<h1>Nuevo evento</h1>
		<a class="btn-secondary" href="/events">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<form method="POST" class="form-grid" use:enhance>
		<div class="form-field full">
			<label for="name">Título *</label>
			<input id="name" name="name" value={values.name ?? ''} required />
		</div>
		<div class="form-field">
			<label for="client_id">Cliente</label>
			<select id="client_id" name="client_id">
				<option value="">Sin cliente</option>
				{#each data.customers as customer (customer.id)}
					<option value={customer.id} selected={String(values.client_id) === String(customer.id)}>
						{customer.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="status">Estado</label>
			<select id="status" name="status">
				<option value="tentativo">Tentativo</option>
				<option value="confirmado">Confirmado</option>
				<option value="completado">Completado</option>
			</select>
		</div>
		<div class="form-field">
			<label for="date">Fecha inicio *</label>
			<input id="date" name="date" type="date" value={values.date ?? ''} required />
		</div>
		<div class="form-field">
			<label for="pickup_date">Fecha fin *</label>
			<input id="pickup_date" name="pickup_date" type="date" value={values.pickup_date ?? ''} required />
		</div>
		<div class="form-field full">
			<label for="location">Lugar</label>
			<input id="location" name="location" value={values.location ?? ''} />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="3">{values.notes ?? ''}</textarea>
		</div>
		<div class="form-field full">
			<button type="submit" class="btn-primary">Crear evento</button>
		</div>
	</form>
</section>
