<script>
	import { enhance } from '$app/forms';
	import {
		RECORD_STATE,
		RECORD_STATE_FILTER_LABELS,
		RECORD_STATES,
		recordStateBadgeClass,
		recordStateLabel
	} from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import Modal from '$lib/components/Modal.svelte';

	/**
	 * Pantalla generica de catalogo: tabla, y el alta/edicion en un dialogo.
	 * Los tres catalogos simples (tipos de evento, proveedores y colaboradores)
	 * solo se diferencian en sus campos, asi que se declaran con `fields` en vez
	 * de duplicar el marcado tres veces.
	 *
	 * Cada campo: { name, label, type?, required?, placeholder?, full? }
	 * `type` acepta 'text' | 'email' | 'color' | 'textarea'.
	 */
	let {
		hint = '',
		fields,
		entries,
		form = null,
		/** Columnas de la tabla: { field, label, kind? } */
		columns,
		/**
		 * Estado que se esta viendo, para el filtro.
		 *
		 * NO se puede llamar `state`: un binding local con ese nombre convierte
		 * `$state(...)` de mas abajo en una suscripcion a un store, y la pantalla
		 * revienta en el servidor con `store_invalid_shape`. El compilador solo
		 * lo avisa; `vite build` pasa igual.
		 */
		currentState = RECORD_STATE.ACTIVE,
		/** Ancho del dialogo: 'sm' una columna, 'md' dos. */
		size = 'md'
	} = $props();

	const TONES = {
		[RECORD_STATE.ACTIVE]: 'ok',
		[RECORD_STATE.INACTIVE]: 'warn',
		[RECORD_STATE.ARCHIVED]: 'off'
	};

	const stateOptions = RECORD_STATES.map((value) => ({
		value,
		label: RECORD_STATE_FILTER_LABELS[value],
		tone: TONES[value]
	}));

	/**
	 * `?/save` a secas BORRA el resto de la query, asi que al guardar desde
	 * «Inactivos» la pantalla saltaba a «Activos». El nombre de la action tiene
	 * que ir el ultimo; lo de delante son parametros normales.
	 */
	const saveAction = $derived(`?state=${currentState}&/save`);
	const toggleAction = $derived(`?state=${currentState}&/toggle`);

	/**
	 * A donde puede ir cada entrada desde donde esta. Se listan los DESTINOS, no
	 * un interruptor: con tres estados «alternar» no significa nada.
	 */
	function transiciones(current) {
		if (current === RECORD_STATE.ACTIVE) {
			return [
				{ to: RECORD_STATE.INACTIVE, label: 'Desactivar', variant: 'btn-secondary' },
				{ to: RECORD_STATE.ARCHIVED, label: 'Archivar', variant: 'btn-danger' }
			];
		}
		if (current === RECORD_STATE.INACTIVE) {
			return [
				{ to: RECORD_STATE.ACTIVE, label: 'Reactivar', variant: 'btn-secondary' },
				{ to: RECORD_STATE.ARCHIVED, label: 'Archivar', variant: 'btn-danger' }
			];
		}
		// Archivada: solo se puede sacar del archivo.
		return [{ to: RECORD_STATE.ACTIVE, label: 'Reactivar', variant: 'btn-secondary' }];
	}

	// El dialogo sirve para alta y edicion: al editar se precarga la fila.
	let open = $state(false);
	let editingId = $state(null);
	let draft = $state({});

	/**
	 * Error del guardado, en estado propio y NO leido de `form`.
	 * `form` es unico por pagina: los `?/toggle` de cada fila escriben en el
	 * mismo objeto, asi que mirarlo aqui haria que desactivar una fila pintase
	 * su mensaje dentro del dialogo.
	 */
	let errorGuardar = $state(null);

	const values = $derived(form?.values ?? draft);
	const isEditing = $derived(editingId !== null);

	function abrirAlta() {
		editingId = null;
		draft = {};
		errorGuardar = null;
		open = true;
	}

	function abrirEdicion(entry) {
		editingId = String(entry.id);
		draft = { ...entry };
		errorGuardar = null;
		open = true;
	}

	function cerrar() {
		open = false;
		editingId = null;
		draft = {};
		errorGuardar = null;
	}

	const alGuardar = () => async ({ update, result }) => {
		// `reset` solo en exito: en error hay que conservar lo tecleado.
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrar();
		} else {
			errorGuardar = result.data?.error ?? 'No se pudo guardar.';
		}
	};
</script>

<section class="panel">
	<FilterBar
		selects={[
			{
				name: 'state',
				label: 'Estado',
				value: String(currentState),
				options: stateOptions,
				width: '11rem'
			}
		]}
	>
		{#snippet actions()}
			<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nueva entrada</button>
		{/snippet}
	</FilterBar>

	{#if hint}
		<p class="panel-hint">{hint}</p>
	{/if}

	<!-- Los mensajes de pagina se callan mientras el dialogo esta abierto: su
	     error se pinta dentro, y detras no debe quedar el mismo texto repetido. -->
	{#if !open}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="alert-success" role="status">{form.success}</div>
		{/if}
	{/if}

	{#if entries.length === 0}
		<p class="empty-state">
			{#if currentState === RECORD_STATE.ACTIVE}
				Todavía no hay entradas. Agrega la primera con «Nueva entrada».
			{:else}
				No hay entradas en este estado.
			{/if}
		</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					{#each columns as column (column.field)}
						<th>{column.label}</th>
					{/each}
					<th>Estado</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each entries as entry (entry.id)}
					{@const current = Number(entry.is_active)}
					<!-- Sin atenuar la fila. `opacity` sobre el `<tr>` hundia el badge de
					     estado a 2.65:1 y el boton «Archivar» a 2.98:1, los dos por debajo
					     de AA: se difuminaba justo lo que anuncia el estado. El badge ya lo
					     dice, y asi lo dice legible. -->
					<tr>
						{#each columns as column (column.field)}
							<td>
								{#if column.kind === 'color'}
									<span class="color-chip" style={`background:${entry[column.field] || '#6366f1'}`}
									></span>
									<span class="color-value">{entry[column.field] || '—'}</span>
								{:else}
									{entry[column.field] || '—'}
								{/if}
							</td>
						{/each}
						<td>
							<span class="badge {recordStateBadgeClass(current)}">{recordStateLabel(current)}</span>
						</td>
						<td class="row-actions">
							<button type="button" class="btn-edit" onclick={() => abrirEdicion(entry)}>
								Editar
							</button>
							{#each transiciones(current) as paso (paso.to)}
								<form method="POST" action={toggleAction} use:enhance>
									<input type="hidden" name="id" value={entry.id} />
									<input type="hidden" name="is_active" value={paso.to} />
									<button type="submit" class="{paso.variant} btn-sm">{paso.label}</button>
								</form>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal bind:open {size} title={isEditing ? 'Editar entrada' : 'Nueva entrada'} onclose={cerrar}>
	{#if errorGuardar}
		<div class="alert-error" role="alert">{errorGuardar}</div>
	{/if}

	<form id="catalog-form" method="POST" action={saveAction} class="form-grid" use:enhance={alGuardar}>
		{#if isEditing}
			<input type="hidden" name="id" value={editingId} />
		{/if}

		{#each fields as field (field.name)}
			<div class="form-field" class:full={field.full || field.type === 'textarea'}>
				<label for={`f-${field.name}`}>
					{field.label}{#if field.required}&nbsp;*{/if}
				</label>
				{#if field.type === 'textarea'}
					<textarea id={`f-${field.name}`} name={field.name} rows="2"
						>{values[field.name] ?? ''}</textarea
					>
				{:else if field.type === 'color'}
					<input
						id={`f-${field.name}`}
						name={field.name}
						type="color"
						class="color-input"
						value={values[field.name] ?? '#6366f1'}
					/>
				{:else}
					<input
						id={`f-${field.name}`}
						name={field.name}
						type={field.type ?? 'text'}
						placeholder={field.placeholder ?? ''}
						required={field.required}
						value={values[field.name] ?? ''}
					/>
				{/if}
			</div>
		{/each}
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrar}>Cancelar</button>
		<button type="submit" form="catalog-form" class="btn-primary">
			{isEditing ? 'Guardar cambios' : 'Agregar'}
		</button>
	{/snippet}
</Modal>

<style>
	.color-input {
		padding: 2px;
		height: 38px;
		cursor: pointer;
	}

	.color-chip {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 4px;
		margin-right: 6px;
		vertical-align: -2px;
	}

	.color-value {
		font-size: var(--font-sm);
		color: var(--text-muted);
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
