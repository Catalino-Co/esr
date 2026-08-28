<script>
	import { enhance } from '$app/forms';
	import { ROLE_DESCRIPTIONS, roleLabel } from '@esr/core';

	let { data, form } = $props();

	const values = $derived(form?.values ?? {});
</script>

<section class="panel">
	<div class="page-header">
		<h1>Miembros</h1>
		<a class="btn-secondary" href="/settings">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<form method="POST" action="?/invite" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="email">Email de la cuenta *</label>
			<input id="email" name="email" type="email" value={values.email ?? ''} required />
			{#if form?.fieldErrors?.email}<span class="form-error">{form.fieldErrors.email}</span>{/if}
		</div>
		<div class="form-field">
			<label for="role">Rol *</label>
			<select id="role" name="role" required>
				{#each data.assignableRoles as role (role)}
					<option value={role} selected={values.role === role}>{roleLabel(role)}</option>
				{/each}
			</select>
			{#if form?.fieldErrors?.role}<span class="form-error">{form.fieldErrors.role}</span>{/if}
		</div>
		<div class="form-field">
			<span class="form-field-label">&nbsp;</span>
			<button type="submit" class="btn-primary">Agregar miembro</button>
		</div>
		<p class="panel-hint full">
			La cuenta debe existir previamente en ESR Cloud. Agregar un miembro no crea usuarios ni contraseñas.
		</p>
	</form>
</section>

<section class="panel">
	<h2 class="panel-title">Miembros de la empresa</h2>

	{#if data.members.length === 0}
		<p class="empty-state">Aún no hay miembros registrados.</p>
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
					{@const isOwner = member.role === 'owner'}
					{@const isSelf = String(member.user_id) === String(data.currentUserId)}
					<tr>
						<td>
							{member.user_name}
							{#if isSelf}<span class="tag-self">tú</span>{/if}
						</td>
						<td>{member.user_email}</td>
						<td>
							{#if isOwner}
								<span class="badge badge-active">{roleLabel(member.role)}</span>
							{:else}
								<form method="POST" action="?/updateRole" class="row-form" use:enhance>
									<input type="hidden" name="member_id" value={member.id} />
									<select name="role" aria-label={`Rol de ${member.user_name}`}>
										{#each data.assignableRoles as role (role)}
											<option value={role} selected={member.role === role} title={ROLE_DESCRIPTIONS[role]}>
												{roleLabel(role)}
											</option>
										{/each}
									</select>
									<button type="submit" class="btn-secondary btn-sm">Guardar</button>
								</form>
							{/if}
						</td>
						<td>
							<span class="badge" class:badge-active={member.status === 'active'} class:badge-inactive={member.status !== 'active'}>
								{member.status === 'active' ? 'Activo' : member.status === 'invited' ? 'Invitado' : 'Inactivo'}
							</span>
						</td>
						<td>
							{#if isOwner}
								<span class="text-muted">—</span>
							{:else}
								<form method="POST" action="?/setStatus" use:enhance>
									<input type="hidden" name="member_id" value={member.id} />
									<input type="hidden" name="status" value={member.status === 'active' ? 'inactive' : 'active'} />
									<button type="submit" class={member.status === 'active' ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
										{member.status === 'active' ? 'Desactivar' : 'Reactivar'}
									</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<dl class="role-legend">
		{#each data.assignableRoles as role (role)}
			<div>
				<dt>{roleLabel(role)}</dt>
				<dd>{ROLE_DESCRIPTIONS[role]}</dd>
			</div>
		{/each}
	</dl>
</section>

<style>
	.panel-title {
		margin: 0 0 16px;
		font-size: 1.05rem;
	}

	.row-form {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.btn-sm {
		padding: 6px 10px;
		font-size: 0.82rem;
	}

	.tag-self {
		margin-left: 6px;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.text-muted {
		color: var(--text-muted);
	}

	.full {
		grid-column: 1 / -1;
	}

	.role-legend {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 12px;
		margin: 24px 0 0;
		padding-top: 16px;
		border-top: 1px solid var(--border-color);
	}

	.role-legend dt {
		font-size: 0.85rem;
		font-weight: 700;
	}

	.role-legend dd {
		margin: 2px 0 0;
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
</style>
