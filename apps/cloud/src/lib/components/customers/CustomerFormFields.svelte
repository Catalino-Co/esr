<script>
	import {
		DOCUMENT_TYPES,
		DOCUMENT_TYPE_LABELS,
		PAYMENT_TERMS,
		PAYMENT_TERMS_LABELS,
		RECORD_STATES,
		RECORD_STATE_LABELS
	} from '@esr/core';

	/**
	 * Campos del cliente, agrupados. Los comparten el alta y la ficha: son el
	 * mismo formulario y separarlos era garantia de que un campo nuevo se
	 * agregara solo en uno de los dos.
	 *
	 * Los `<fieldset>` no son decorativos: el `<legend>` nombra el grupo para
	 * los lectores de pantalla, cosa que un `<h3>` suelto no hace.
	 */
	let {
		/** Valores actuales. En el alta, lo que devolvio un `fail`. */
		values = {},
		sectors = [],
		fieldErrors = null,
		/** El select de estado solo aparece en la ficha, y con permiso. */
		showState = false
	} = $props();

	const texto = (campo) => values[campo] ?? '';

	// El estado por defecto es ACTIVO solo cuando el registro aun no existe.
	const estado = $derived(String(values.is_active ?? 1));
</script>

<fieldset class="form-section">
	<legend>Identificación</legend>
	<div class="form-grid">
		<div class="form-field full">
			<label for="name">Nombre *</label>
			<input id="name" name="name" value={texto('name')} required />
			{#if fieldErrors?.name}<span class="form-error">{fieldErrors.name}</span>{/if}
		</div>

		<!-- Tipo y numero van en el MISMO campo: separarlos deja que el reflow
		     los ponga en filas distintas, y por separado no significan nada. -->
		<div class="form-field full">
			<label for="document_id">Documento</label>
			<div class="doc-pair">
				<select id="document_type" name="document_type" aria-label="Tipo de documento">
					<!-- «Sin especificar» es un valor legitimo y es el que traen los
					     clientes que ya existian. Preseleccionar RNC haria que abrir
					     una ficha vieja y pulsar «Guardar» escribiera un dato fiscal
					     que nadie afirmo. -->
					<option value="">— Tipo —</option>
					{#each DOCUMENT_TYPES as tipo (tipo)}
						<option value={tipo} selected={values.document_type === tipo}>
							{DOCUMENT_TYPE_LABELS[tipo]}
						</option>
					{/each}
				</select>
				<input id="document_id" name="document_id" value={texto('document_id')} />
			</div>
		</div>
	</div>
</fieldset>

<fieldset class="form-section">
	<legend>Contacto</legend>
	<div class="form-grid">
		<div class="form-field">
			<label for="contact_person">Persona de contacto</label>
			<input id="contact_person" name="contact_person" value={texto('contact_person')} />
		</div>
		<div class="form-field">
			<label for="phone">Teléfono</label>
			<input id="phone" name="phone" value={texto('phone')} />
		</div>
		<div class="form-field full">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" value={texto('email')} />
			{#if fieldErrors?.email}<span class="form-error">{fieldErrors.email}</span>{/if}
		</div>
	</div>
</fieldset>

<fieldset class="form-section">
	<legend>Comercial</legend>
	<div class="form-grid">
		<div class="form-field">
			<label for="payment_terms">Condición de pago</label>
			<select id="payment_terms" name="payment_terms">
				<option value="">— Sin especificar —</option>
				{#each PAYMENT_TERMS as termino (termino)}
					<option value={termino} selected={values.payment_terms === termino}>
						{PAYMENT_TERMS_LABELS[termino]}
					</option>
				{/each}
			</select>
		</div>

		<div class="form-field">
			<label for="sector_id">Sector comercial</label>
			<select id="sector_id" name="sector_id">
				<option value="">— Sin sector —</option>
				{#each sectors as sector (sector.id)}
					<option value={sector.id} selected={String(values.sector_id ?? '') === String(sector.id)}>
						{sector.name}
					</option>
				{/each}
			</select>
			{#if sectors.length === 0}
				<span class="field-hint">
					No hay sectores. Se agregan en <a href="/settings/sectors">Configuración</a>.
				</span>
			{/if}
		</div>

		{#if showState}
			<div class="form-field">
				<label for="is_active">Estado</label>
				<select id="is_active" name="is_active">
					{#each RECORD_STATES as opcion (opcion)}
						<option value={opcion} selected={estado === String(opcion)}>
							{RECORD_STATE_LABELS[opcion]}
						</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>
</fieldset>

<fieldset class="form-section">
	<legend>Fiscal y notas</legend>
	<div class="form-grid">
		<div class="form-field full">
			<label for="address">Dirección fiscal</label>
			<input id="address" name="address" value={texto('address')} />
			<span class="field-hint">
				La que aparece en los documentos. Las direcciones de servicio van aparte.
			</span>
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="3">{texto('notes')}</textarea>
		</div>
	</div>
</fieldset>

<style>
	/* `.form-section` y su `legend` viven en @esr/config/theme.css: los usan
	   las fichas de cliente de las dos apps. Alli el legend va en sentence
	   case; el `text-transform: uppercase` que tenia aqui incumplia la regla 5
	   del sistema de diseño. */

	.doc-pair {
		display: flex;
		gap: var(--sp-2);
	}

	.doc-pair select {
		flex: 0 0 8.5rem;
	}

	.doc-pair input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.field-hint {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}
</style>
