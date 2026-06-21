<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Nueva cotización</h1>
		<a class="btn-secondary" href="/quotes">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<form method="POST" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="event_id">Evento *</label>
			<select id="event_id" name="event_id" required>
				<option value="">Seleccione evento</option>
				{#each data.events as event (event.id)}
					<option
						value={event.id}
						selected={String(data.eventId || data.selectedEvent?.id) === String(event.id)}
					>
						{event.name} ({event.date || 'sin fecha'})
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="client_id">Cliente *</label>
			<select id="client_id" name="client_id" required>
				<option value="">Seleccione cliente</option>
				{#each data.customers as customer (customer.id)}
					<option
						value={customer.id}
						selected={String(data.selectedEvent?.client_id) === String(customer.id)}
					>
						{customer.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="valid_until">Válida hasta</label>
			<input id="valid_until" name="valid_until" type="date" />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="3"></textarea>
		</div>
		<div class="form-field full">
			<button type="submit" class="btn-primary">Crear cotización</button>
		</div>
	</form>
</section>
