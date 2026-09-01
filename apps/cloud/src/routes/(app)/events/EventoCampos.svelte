<script>
	/**
	 * Los campos de un evento, UNA sola vez.
	 *
	 * Lo usan el diálogo de alta y la página de edición. Tenerlo escrito dos
	 * veces es exactamente como se separaron las dos pantallas de cotizaciones,
	 * y aquí son trece campos.
	 *
	 * Va DENTRO de un `.form-grid` que pone quien lo usa: así el formulario de la
	 * ficha puede meter más cosas en la misma rejilla.
	 */
	let {
		/** Lo tecleado, para repoblar tras un error de validación. */
		valores = {},
		customers = [],
		eventTypes = [],
		/** El estado solo se edita en la ficha; al crear nace tentativo. */
		conEstado = false,
		fieldErrors = {}
	} = $props();

	const GRIS = '#94a3b8';
	const colores = $derived(
		new Map(eventTypes.map((t) => [String(t.name).trim().toLowerCase(), t.color]))
	);

	/* El tipo elegido se sigue en local para que la muestra de color reaccione
	   al cambiarlo, sin esperar a guardar. */
	let tipo = $state('');
	$effect(() => {
		tipo = valores.event_type ?? '';
	});
	const colorTipo = $derived(colores.get(String(tipo).trim().toLowerCase()) || GRIS);
</script>

<div class="form-field full">
	<label for="ev-name">Nombre del evento *</label>
	<input id="ev-name" name="name" value={valores.name ?? ''} required placeholder="Boda Rivas-Gómez" />
	{#if fieldErrors.name}<span class="form-error">{fieldErrors.name}</span>{/if}
</div>

<div class="form-field">
	<label for="ev-client">Cliente</label>
	<select id="ev-client" name="client_id">
		<option value="">Sin cliente</option>
		{#each customers as customer (customer.id)}
			<option value={customer.id} selected={String(valores.client_id) === String(customer.id)}>
				{customer.name}
			</option>
		{/each}
	</select>
	{#if fieldErrors.client_id}<span class="form-error">{fieldErrors.client_id}</span>{/if}
</div>

<div class="form-field">
	<label for="ev-type">Tipo de evento</label>
	<div class="con-muestra">
		<select id="ev-type" name="event_type" bind:value={tipo}>
			<option value="">Sin tipo</option>
			{#each eventTypes as et (et.id)}
				<option value={et.name}>{et.name}</option>
			{/each}
		</select>
		<!-- La muestra de color: es lo que después tiñe la fila y el calendario,
		     así que conviene verlo al elegir y no descubrirlo en la tabla. -->
		<span class="muestra" style="background: {colorTipo}" aria-hidden="true"></span>
	</div>
</div>

<div class="form-field">
	<label for="ev-date">Fecha del evento *</label>
	<input id="ev-date" name="date" type="date" value={valores.date ?? ''} required />
	{#if fieldErrors.date}<span class="form-error">{fieldErrors.date}</span>{/if}
</div>

{#if conEstado}
	<div class="form-field">
		<label for="ev-status">Estado</label>
		<select id="ev-status" name="status">
			<option value="tentativo" selected={valores.status === 'tentativo'}>Tentativo</option>
			<option value="confirmado" selected={valores.status === 'confirmado'}>Confirmado</option>
			<option value="completado" selected={valores.status === 'completado'}>Completado</option>
			<option value="cancelado" selected={valores.status === 'cancelado'}>Cancelado</option>
		</select>
	</div>
{:else}
	<!-- Al crear nace tentativo y no se pregunta: un evento que aún no existía
	     no puede estar completado ni cancelado. -->
	<input type="hidden" name="status" value="tentativo" />
{/if}

<p class="separador">Logística</p>

<div class="form-field">
	<label for="ev-departure">Hora de salida (almacén)</label>
	<input id="ev-departure" name="departure_time" type="time" value={valores.departure_time ?? ''} />
</div>

<div class="form-field">
	<label for="ev-setup">Hora de montaje</label>
	<input id="ev-setup" name="setup_time" type="time" value={valores.setup_time ?? ''} />
</div>

<div class="form-field">
	<label for="ev-pickup-date">Fecha de recogida / desmontaje</label>
	<input id="ev-pickup-date" name="pickup_date" type="date" value={valores.pickup_date ?? ''} />
	{#if fieldErrors.pickup_date}<span class="form-error">{fieldErrors.pickup_date}</span>{/if}
</div>

<div class="form-field">
	<label for="ev-pickup-time">Hora de recogida</label>
	<input id="ev-pickup-time" name="pickup_time" type="time" value={valores.pickup_time ?? ''} />
</div>

<div class="form-field">
	<label for="ev-location">Lugar / locación</label>
	<input id="ev-location" name="location" value={valores.location ?? ''} placeholder="Dirección o salón" />
</div>

<div class="form-field">
	<label for="ev-responsible">Responsable comercial</label>
	<input id="ev-responsible" name="responsible_person" value={valores.responsible_person ?? ''} />
</div>

<!--
	Aquí vivía un bloque «Documentos» con dos desplegables para vincular la
	cotización y la orden. Se fue: el vínculo no es un campo del evento —no se
	guarda en `events`, se escribe en el documento—, y meterlo en este formulario
	obligaba a pulsar «Guardar cambios» del evento entero para enganchar una
	cotización. Ahora son dos botones en la barra de la ficha, cada uno con su
	diálogo. Al crear no se ofrece: el alta redirige a la ficha, y allí está.
-->

<div class="form-field full">
	<label for="ev-notes">Condiciones o notas del evento</label>
	<textarea id="ev-notes" name="notes" rows="3">{valores.notes ?? ''}</textarea>
</div>

<style>
	/* Rótulo de sección dentro de la rejilla: ocupa la fila entera y separa los
	   tres bloques del formulario sin sacarlos a tarjetas distintas. */
	.separador {
		grid-column: 1 / -1;
		margin: var(--sp-2) 0 0;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
		font-size: var(--font-xs);
		font-weight: 600;
		text-transform: none;
		color: var(--text-secondary);
	}

	.con-muestra {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.con-muestra select {
		flex: 1;
		min-width: 0;
	}

	.muestra {
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
	}
</style>
