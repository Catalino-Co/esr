<script>
	import { enhance } from '$app/forms';
	import { roleLabel } from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';

	let { data, form } = $props();

	const values = $derived(form?.values ?? {});

	// Alta: solo email y rol, porque la cuenta ya tiene que existir.
	let invitando = $state(false);
	let errorInvitar = $state(null);
	let fieldErrorsInvitar = $state({});

	// Edicion: los cuatro campos del usuario dentro de la empresa.
	// El booleano va aparte del id porque `Modal` enlaza `open` con `bind:`.
	let editandoAbierto = $state(false);
	let editando = $state(null);
	let borrador = $state({});
	let errorEditar = $state(null);
	let fieldErrorsEditar = $state({});

	function abrirInvitar() {
		errorInvitar = null;
		fieldErrorsInvitar = {};
		invitando = true;
	}

	function cerrarInvitar() {
		invitando = false;
		errorInvitar = null;
		fieldErrorsInvitar = {};
	}

	function abrirEdicion(member) {
		editando = member.id;
		editandoAbierto = true;
		borrador = {
			name: member.user_name,
			email: member.user_email,
			role: member.role,
			status: member.status === 'active' ? 'active' : 'inactive'
		};
		errorEditar = null;
		fieldErrorsEditar = {};
	}

	function cerrarEdicion() {
		editandoAbierto = false;
		editando = null;
		borrador = {};
		errorEditar = null;
		fieldErrorsEditar = {};
	}

	/**
	 * Tres niveles a proposito: `use:enhance` recibe la funcion de ENVIO, que se
	 * llama con `{ form, data, cancel }` y devuelve el callback que recibe
	 * `{ result, update }`. Con un nivel menos, `update` y `result` llegan
	 * `undefined`.
	 */
	const alEnviar = (cerrar, setError, setFieldErrors, setDraft) => () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrar();
			return;
		}
		if (result.data?.values && setDraft) setDraft(result.data.values);
		setFieldErrors(result.data?.fieldErrors ?? {});
		setError(result.data?.error ?? 'No se pudo guardar.');
	};

	const estadoTexto = (s) => (s === 'active' ? 'Activo' : s === 'invited' ? 'Invitado' : 'Inactivo');
</script>

<section class="panel">
	<div class="page-header">
		<button type="button" class="btn-primary btn-new" onclick={abrirInvitar}>Agregar usuario</button>
	</div>

	<p class="panel-hint">
		Quién tiene acceso a esta empresa y con qué rol. Para saber qué puede hacer cada rol, mira
		<a href="/settings/roles">Roles y permisos</a>.
	</p>

	{#if !invitando && !editandoAbierto}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="alert-success" role="status">{form.success}</div>
		{/if}
	{/if}

	{#if data.members.length === 0}
		<p class="empty-state">Aún no hay usuarios registrados.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Usuario</th>
					<th>Email</th>
					<th>Rol</th>
					<th>Estado</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each data.members as member (member.id)}
					{@const esAdmin = member.role === 'admin'}
					{@const isSelf = String(member.user_id) === String(data.currentUserId)}
					{@const activo = member.status === 'active'}
					<tr>
						<td>
							{member.user_name}
							{#if isSelf}<span class="tag-self">tú</span>{/if}
						</td>
						<td>{member.user_email}</td>
						<td>
							<!-- El badge destaca al ADMINISTRADOR, que es quien manda desde que
							     el propietario dejo de existir. Antes destacaba al propietario. -->
							<span class="badge" class:badge-active={esAdmin} class:badge-muted={!esAdmin}>
								{roleLabel(member.role)}
							</span>
						</td>
						<td>
							<span class="badge" class:badge-active={activo} class:badge-inactive={!activo}>
								{estadoTexto(member.status)}
							</span>
						</td>
						<!-- TODOS los miembros son editables. El propietario intocable se fue
						     con su rol; lo que impide que la empresa se quede sin quien la
						     administre es la guarda del servidor, que exige al menos un
						     administrador ACTIVO y responde con su propio mensaje. -->
						<td class="row-actions">
							<button type="button" class="btn-edit" onclick={() => abrirEdicion(member)}>
								Editar
							</button>
							<form method="POST" action="?/setStatus" use:enhance>
								<input type="hidden" name="member_id" value={member.id} />
								<input type="hidden" name="status" value={activo ? 'inactive' : 'active'} />
								<button type="submit" class={activo ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
									{activo ? 'Desactivar' : 'Reactivar'}
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal bind:open={invitando} size="sm" title="Agregar usuario" onclose={cerrarInvitar}>
	{#if errorInvitar}
		<div class="alert-error" role="alert">{errorInvitar}</div>
	{/if}

	<form
		id="invite-form"
		method="POST"
		action="?/invite"
		class="form-grid"
		use:enhance={alEnviar(
			cerrarInvitar,
			(m) => (errorInvitar = m),
			(f) => (fieldErrorsInvitar = f),
			null
		)}
	>
		<div class="form-field full">
			<label for="email">Email de la cuenta *</label>
			<input id="email" name="email" type="email" value={values.email ?? ''} required />
			{#if fieldErrorsInvitar.email}<span class="form-error">{fieldErrorsInvitar.email}</span>{/if}
		</div>
		<div class="form-field full">
			<label for="role">Rol *</label>
			<select id="role" name="role" required>
				{#each data.assignableRoles as role (role)}
					<option value={role} selected={values.role === role}>{roleLabel(role)}</option>
				{/each}
			</select>
			{#if fieldErrorsInvitar.role}<span class="form-error">{fieldErrorsInvitar.role}</span>{/if}
		</div>
		<p class="panel-hint full">
			La cuenta debe existir previamente en ESR Cloud. Agregar un usuario no crea cuentas ni
			contraseñas.
		</p>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarInvitar}>Cancelar</button>
		<button type="submit" form="invite-form" class="btn-primary">Agregar</button>
	{/snippet}
</Modal>

<Modal bind:open={editandoAbierto} size="sm" title="Editar usuario" onclose={cerrarEdicion}>
	{#if errorEditar}
		<div class="alert-error" role="alert">{errorEditar}</div>
	{/if}

	<form
		id="user-form"
		method="POST"
		action="?/updateMember"
		class="form-grid"
		use:enhance={alEnviar(
			cerrarEdicion,
			(m) => (errorEditar = m),
			(f) => (fieldErrorsEditar = f),
			(v) => (borrador = { ...borrador, ...v })
		)}
	>
		<input type="hidden" name="member_id" value={editando} />

		<div class="form-field full">
			<label for="u-name">Nombre *</label>
			<input id="u-name" name="name" required value={borrador.name ?? ''} />
			{#if fieldErrorsEditar.name}<span class="form-error">{fieldErrorsEditar.name}</span>{/if}
		</div>
		<div class="form-field full">
			<label for="u-email">Email *</label>
			<input id="u-email" name="email" type="email" required value={borrador.email ?? ''} />
			{#if fieldErrorsEditar.email}<span class="form-error">{fieldErrorsEditar.email}</span>{/if}
		</div>

		<p class="aviso-cuenta full">
			El nombre y el email son de la <strong>cuenta</strong>, no de esta empresa. Cambiarlos
			cambia con qué email inicia sesión esa persona, y su nombre en todas las empresas donde sea
			usuario.
		</p>

		<div class="form-field full">
			<label for="u-role">Rol *</label>
			<select id="u-role" name="role" required>
				{#each data.assignableRoles as role (role)}
					<option value={role} selected={borrador.role === role}>{roleLabel(role)}</option>
				{/each}
			</select>
			{#if fieldErrorsEditar.role}<span class="form-error">{fieldErrorsEditar.role}</span>{/if}
		</div>
		<div class="form-field full">
			<label for="u-status">Estado *</label>
			<select id="u-status" name="status" required>
				<option value="active" selected={borrador.status === 'active'}>Activo</option>
				<option value="inactive" selected={borrador.status !== 'active'}>Inactivo</option>
			</select>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarEdicion}>Cancelar</button>
		<button type="submit" form="user-form" class="btn-primary">Guardar cambios</button>
	{/snippet}
</Modal>

<style>
	.row-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.82rem;
	}

	.tag-self {
		margin-left: 6px;
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	.text-muted {
		color: var(--text-secondary);
	}

	.full {
		grid-column: 1 / -1;
	}

	/* El aviso va pegado a los dos campos que escriben en la cuenta global, no
	   al pie del dialogo: ahi no lo leeria nadie antes de teclear. */
	.aviso-cuenta {
		margin: 0;
		padding: var(--sp-3);
		border-radius: var(--radius);
		background: var(--warning-bg);
		color: var(--warning-text);
		font-size: var(--font-sm);
		line-height: 1.5;
	}
</style>
