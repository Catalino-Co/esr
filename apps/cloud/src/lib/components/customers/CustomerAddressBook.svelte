<script>
	import { enhance } from '$app/forms';
	import { RECORD_STATE, recordStateBadgeClass, recordStateLabel } from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';

	/**
	 * Directorio de direcciones de SERVICIO de un cliente: a donde se entrega o
	 * se monta. No confundir con la direccion fiscal, que sigue en el propio
	 * cliente porque es la que sale en la factura.
	 *
	 * Vive en la tarjeta HERMANA del formulario del cliente, no dentro. No es
	 * una decision estetica: los `<form>` no se anidan, y cada entrada lleva sus
	 * propios micro-formularios (estado, principal) que no pueden quedar dentro
	 * del `<form action="?/update">` del cliente.
	 */
	let {
		addresses = [],
		addressTypes = [],
		/** Valores del cliente que se heredan cuando el campo va vacio. */
		inherited = {},
		form = null,
		/**
		 * En el alta el cliente aun no existe, asi que no puede tener filas. La
		 * tarjeta se pinta igual, deshabilitada: si desapareciera, la pantalla
		 * cambiaria de forma entre crear y editar.
		 */
		disabled = false,
		disabledHint = ''
	} = $props();

	const HEREDABLES = ['contact_person', 'phone', 'email'];

	let open = $state(false);
	let editingId = $state(null);
	let draft = $state({});
	let hereda = $state({ contact_person: true, phone: true, email: true });

	/**
	 * Error del dialogo, en estado propio y NO leido de `form`.
	 * `form` es unico por pagina: un `?/setAddressState` de otra entrada escribe
	 * en el mismo objeto, y mirarlo aqui pintaria su mensaje dentro del dialogo.
	 */
	let errorGuardar = $state(null);

	const isEditing = $derived(editingId !== null);
	const mensaje = $derived(form?.scope === 'address' ? form : null);

	function abrirAlta() {
		editingId = null;
		draft = {};
		hereda = { contact_person: true, phone: true, email: true };
		errorGuardar = null;
		open = true;
	}

	function abrirEdicion(entrada) {
		editingId = String(entrada.id);
		draft = { ...entrada };
		// `null` en la columna ES la herencia: la casilla lo refleja, no lo decide.
		hereda = Object.fromEntries(HEREDABLES.map((c) => [c, entrada[c] == null]));
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
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') cerrar();
		else errorGuardar = result.data?.error ?? 'No se pudo guardar la dirección.';
	};

	/** Que se ve en el campo cuando la casilla de heredar esta marcada. */
	const heredado = (campo) => inherited[campo] || '';

	function transiciones(estado) {
		if (estado === RECORD_STATE.ACTIVE) {
			return [
				{ to: RECORD_STATE.INACTIVE, label: 'Desactivar' },
				{ to: RECORD_STATE.ARCHIVED, label: 'Archivar' }
			];
		}
		if (estado === RECORD_STATE.INACTIVE) {
			return [
				{ to: RECORD_STATE.ACTIVE, label: 'Reactivar' },
				{ to: RECORD_STATE.ARCHIVED, label: 'Archivar' }
			];
		}
		return [{ to: RECORD_STATE.ACTIVE, label: 'Reactivar' }];
	}
</script>

<section class="panel" class:panel-disabled={disabled}>
	<div class="book-header">
		<div>
			<h2>Direcciones de servicio</h2>
			<p class="panel-hint">
				Dónde se entrega o se monta. Su tipo se configura en
				<a href="/settings/address-types">Tipos de dirección</a>.
			</p>
		</div>
		{#if !disabled}
			<button type="button" class="btn-primary btn-new btn-sm" onclick={abrirAlta}>
				Agregar dirección
			</button>
		{/if}
	</div>

	{#if disabled}
		<p class="empty-state">{disabledHint}</p>
	{:else}
		<!-- Los mensajes se callan con el dialogo abierto: su error se pinta
		     dentro, y detras no debe quedar el mismo texto repetido. -->
		{#if !open && mensaje?.error}
			<div class="alert-error" role="alert">{mensaje.error}</div>
		{/if}
		{#if !open && mensaje?.success}
			<div class="alert-success" role="status">{mensaje.success}</div>
		{/if}

		{#if addresses.length === 0}
			<p class="empty-state">
				Este cliente todavía no tiene direcciones de servicio.
			</p>
		{:else}
			<ul class="directory">
				{#each addresses as entrada (entrada.id)}
					{@const estado = Number(entrada.is_active)}
					<li class="sunken-card" class:entry-off={estado !== RECORD_STATE.ACTIVE}>
						<div class="entry-top">
							<strong>{entrada.label}</strong>
							{#if entrada.address_type_name}
								<span class="chip">{entrada.address_type_name}</span>
							{/if}
							{#if entrada.is_primary}
								<span class="chip chip-primary">★ Principal</span>
							{/if}
							{#if estado !== RECORD_STATE.ACTIVE}
								<span class="badge {recordStateBadgeClass(estado)}">{recordStateLabel(estado)}</span>
							{/if}
						</div>

						<p class="entry-address">{entrada.address}</p>

						<dl class="entry-contact">
							<div>
								<dt>Contacto</dt>
								<dd>
									{entrada.effective_contact_person || '—'}
									{#if entrada.contact_person == null && entrada.effective_contact_person}
										<span class="inherited">· heredado</span>
									{/if}
								</dd>
							</div>
							<div>
								<dt>Teléfono</dt>
								<dd>
									{entrada.effective_phone || '—'}
									{#if entrada.phone == null && entrada.effective_phone}
										<span class="inherited">· heredado</span>
									{/if}
								</dd>
							</div>
							<div>
								<dt>Celular</dt>
								<dd>{entrada.mobile || '—'}</dd>
							</div>
							<div>
								<dt>Email</dt>
								<dd>
									{entrada.effective_email || '—'}
									{#if entrada.email == null && entrada.effective_email}
										<span class="inherited">· heredado</span>
									{/if}
								</dd>
							</div>
						</dl>

						<div class="entry-actions">
							<button type="button" class="btn-edit" onclick={() => abrirEdicion(entrada)}>
								Editar
							</button>

							{#if estado === RECORD_STATE.ACTIVE && !entrada.is_primary}
								<form method="POST" action="?/setPrimaryAddress" use:enhance>
									<input type="hidden" name="id" value={entrada.id} />
									<button type="submit" class="btn-secondary btn-sm">★ Principal</button>
								</form>
							{/if}

							{#each transiciones(estado) as paso (paso.to)}
								<form method="POST" action="?/setAddressState" use:enhance>
									<input type="hidden" name="id" value={entrada.id} />
									<input type="hidden" name="state" value={paso.to} />
									<button
										type="submit"
										class="{paso.to === RECORD_STATE.ARCHIVED ? 'btn-danger' : 'btn-secondary'} btn-sm"
									>
										{paso.label}
									</button>
								</form>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<Modal bind:open size="md" title={isEditing ? 'Editar dirección' : 'Nueva dirección'} onclose={cerrar}>
	{#if errorGuardar}
		<div class="alert-error" role="alert">{errorGuardar}</div>
	{/if}

	<form id="address-form" method="POST" action="?/saveAddress" class="form-grid" use:enhance={alGuardar}>
		{#if isEditing}
			<input type="hidden" name="id" value={editingId} />
		{/if}

		<div class="form-field">
			<label for="a-label">Detalle *</label>
			<input
				id="a-label"
				name="label"
				value={draft.label ?? ''}
				placeholder="Sucursal Herrera, Plaza Internacional…"
				required
			/>
		</div>

		<div class="form-field">
			<label for="a-type">Tipo</label>
			<select id="a-type" name="address_type_id">
				<option value="">— Sin tipo —</option>
				{#each addressTypes as tipo (tipo.id)}
					<option value={tipo.id} selected={String(draft.address_type_id ?? '') === String(tipo.id)}>
						{tipo.name}
					</option>
				{/each}
			</select>
		</div>

		<div class="form-field full">
			<label for="a-address">Dirección *</label>
			<input id="a-address" name="address" value={draft.address ?? ''} required />
		</div>

		{#each [{ campo: 'contact_person', etiqueta: 'Persona de contacto' }, { campo: 'phone', etiqueta: 'Teléfono' }, { campo: 'email', etiqueta: 'Email' }] as fila (fila.campo)}
			<div class="form-field">
				<label for={`a-${fila.campo}`}>{fila.etiqueta}</label>
				<input
					id={`a-${fila.campo}`}
					name={fila.campo}
					value={hereda[fila.campo] ? heredado(fila.campo) : (draft[fila.campo] ?? '')}
					readonly={hereda[fila.campo]}
					class:is-inherited={hereda[fila.campo]}
				/>
				<!-- La casilla se ENVIA con nombre propio; el servidor decide con
				     ella. Usar `disabled` en el input funcionaria por accidente
				     (no se envia → el servidor recibe ausencia → NULL), y se
				     rompe en silencio el dia que alguien lo cambie a `readonly`
				     para poder copiar el texto. -->
				<label class="inherit-check">
					<input
						type="checkbox"
						name={`inherit_${fila.campo}`}
						value="1"
						bind:checked={hereda[fila.campo]}
					/>
					Usar el del cliente
				</label>
			</div>
		{/each}

		<div class="form-field">
			<label for="a-mobile">Celular</label>
			<!-- No hereda: el cliente no tiene celular. -->
			<input id="a-mobile" name="mobile" value={draft.mobile ?? ''} />
		</div>

		<div class="form-field full">
			<label for="a-notes">Notas de acceso</label>
			<textarea id="a-notes" name="notes" rows="2" placeholder="Portón, horario de descarga, a quién llamar al llegar…"
				>{draft.notes ?? ''}</textarea
			>
		</div>

		<div class="form-field full">
			<label class="inherit-check">
				<input type="checkbox" name="is_primary" value="1" checked={draft.is_primary ?? false} />
				Marcar como dirección principal
			</label>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrar}>Cancelar</button>
		<button type="submit" form="address-form" class="btn-primary">
			{isEditing ? 'Guardar dirección' : 'Agregar'}
		</button>
	{/snippet}
</Modal>

<style>
	.book-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.book-header h2 {
		margin: 0 0 4px;
		font-size: var(--font-lg);
	}

	.book-header .panel-hint {
		margin: 0;
	}

	.panel-disabled {
		opacity: 0.7;
	}

	.directory {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* Nada de `opacity` sobre la entrada entera: difumina tambien los botones,
	   y el «Archivar» rojo caia a 2.98:1, por debajo de AA. Lo inactivo ya se
	   anuncia con su badge, que es la señal honesta. Se atenua solo el
	   encabezado, que es texto. */
	.entry-off .entry-top strong {
		color: var(--text-secondary);
		font-weight: 600;
	}

	.entry-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: 4px;
	}

	.chip {
		padding: 1px var(--sp-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: var(--font-xs);
		/* --text-secondary y NO --text-muted: sobre el fondo hundido de
		   `.sunken-card` el muted cae a 4.34:1, por debajo de AA. */
		color: var(--text-secondary);
	}

	.chip-primary {
		border-color: var(--accent-active);
		color: var(--accent-active);
	}

	.entry-address {
		margin: 0 0 var(--sp-2);
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.entry-contact {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: var(--sp-2) var(--sp-3);
		margin: 0 0 var(--sp-3);
	}

	.entry-contact div {
		min-width: 0;
	}

	.entry-contact dt {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.entry-contact dd {
		margin: 0;
		font-size: var(--font-sm);
		overflow-wrap: anywhere;
	}

	.inherited {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.entry-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}

	.inherit-check {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
		font-size: var(--font-xs);
		color: var(--text-secondary);
		font-weight: 400;
	}

	.inherit-check input {
		width: auto;
	}

	.is-inherited {
		color: var(--text-secondary);
	}
</style>
