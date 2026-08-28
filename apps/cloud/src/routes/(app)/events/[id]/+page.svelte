<script>
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const event = data.event;
</script>

<section class="panel">
	<div class="page-header">
		<h1>{event.name}</h1>
		<a class="btn-secondary" href="/events">Volver al listado</a>
	</div>

	{#if form?.success}
		<p class="badge badge-active">Cambios guardados.</p>
	{/if}
	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	{#if data.client}
		<p>Cliente asociado: <strong>{data.client.name}</strong></p>
	{/if}

	<form method="POST" action="?/update" class="form-grid" use:enhance>
		<div class="form-field full">
			<label for="name">Título *</label>
			<input id="name" name="name" value={event.name} required />
		</div>
		<div class="form-field">
			<label for="client_id">Cliente</label>
			<select id="client_id" name="client_id">
				<option value="">Sin cliente</option>
				{#each data.customers as customer (customer.id)}
					<option value={customer.id} selected={String(event.client_id) === String(customer.id)}>
						{customer.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="status">Estado</label>
			<select id="status" name="status">
				<option value="tentativo" selected={event.status === 'tentativo'}>Tentativo</option>
				<option value="confirmado" selected={event.status === 'confirmado'}>Confirmado</option>
				<option value="completado" selected={event.status === 'completado'}>Completado</option>
				<option value="cancelado" selected={event.status === 'cancelado'}>Cancelado</option>
			</select>
		</div>
		<div class="form-field">
			<label for="date">Fecha inicio *</label>
			<input id="date" name="date" type="date" value={event.date ?? ''} required />
		</div>
		<div class="form-field">
			<label for="pickup_date">Fecha fin *</label>
			<input id="pickup_date" name="pickup_date" type="date" value={event.pickup_date ?? event.date ?? ''} required />
		</div>
		<div class="form-field full">
			<label for="location">Lugar</label>
			<input id="location" name="location" value={event.location ?? ''} />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="3">{event.notes ?? ''}</textarea>
		</div>
		<div class="form-field full">
			{#if can('events.update')}
				<button type="submit" class="btn-primary">Guardar cambios</button>
			{:else}
				<p class="panel-hint">Su rol no permite editar este registro.</p>
			{/if}
		</div>
	</form>

	<h2 style="margin-top: 28px">Cotizaciones</h2>
	{#if can('quotes.create')}
		<div class="page-actions" style="margin-bottom: 12px">
			<a class="btn-primary" href="/quotes/new?eventId={event.id}">Crear cotización</a>
		</div>
	{/if}
	{#if data.quotes.length === 0}
		<p class="empty-state">No hay cotizaciones para este evento.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Número</th><th>Estado</th><th>Total</th><th></th></tr>
			</thead>
			<tbody>
				{#each data.quotes as quote (quote.id)}
					<tr>
						<td>{quote.quote_number || `#${quote.id}`}</td>
						<td>{quote.status}</td>
						<td>{Number(quote.total || 0).toFixed(2)}</td>
						<td><a href="/quotes/{quote.id}">Ver</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<div class="page-actions" style="margin-top: 16px">
		{#if event.status !== 'cancelado' && can('events.cancel')}
			<form method="POST" action="?/cancel" use:enhance>
				<button type="submit" class="btn-secondary">Cancelar evento</button>
			</form>
		{/if}
		{#if event.is_active && can('events.deactivate')}
			<form method="POST" action="?/deactivate" use:enhance>
				<button type="submit" class="btn-danger">Desactivar evento</button>
			</form>
		{/if}
	</div>
</section>
