<script>
	import { enhance } from '$app/forms';

	/**
	 * Pantalla generica de catalogo: formulario de alta/edicion arriba y tabla
	 * abajo. Los tres catalogos simples (tipos de evento, proveedores y
	 * colaboradores) solo se diferencian en sus campos, asi que se declaran con
	 * `fields` en vez de duplicar el marcado tres veces.
	 *
	 * Cada campo: { name, label, type?, required?, placeholder?, full? }
	 * `type` acepta 'text' | 'email' | 'color' | 'textarea'.
	 */
	let {
		title,
		hint = '',
		fields,
		entries,
		form = null,
		/** Columnas de la tabla: { field, label, kind? } */
		columns
	} = $props();

	// El formulario sirve para alta y edicion: al editar se precarga la fila.
	let editingId = $state(null);
	let draft = $state({});

	const values = $derived(form?.values ?? draft);
	const isEditing = $derived(editingId !== null);

	function startEdit(entry) {
		editingId = String(entry.id);
		draft = { ...entry };
	}

	function cancelEdit() {
		editingId = null;
		draft = {};
	}
</script>

<section class="panel">
	<div class="page-header">
		<h1>{title}</h1>
	</div>

	{#if hint}
		<p class="panel-hint">{hint}</p>
	{/if}

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<h2 class="catalog-subtitle">{isEditing ? 'Editar entrada' : 'Nueva entrada'}</h2>

	<form
		method="POST"
		action="?/save"
		class="form-grid"
		use:enhance={() => async ({ update, result }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') cancelEdit();
		}}
	>
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

		<div class="form-field full catalog-actions">
			<button type="submit" class="btn-primary">
				{isEditing ? 'Guardar cambios' : 'Agregar'}
			</button>
			{#if isEditing}
				<button type="button" class="btn-secondary" onclick={cancelEdit}>Cancelar</button>
			{/if}
		</div>
	</form>
</section>

<section class="panel">
	<h2 class="catalog-subtitle">Registradas ({entries.length})</h2>

	{#if entries.length === 0}
		<p class="empty-state">Todavía no hay entradas. Agrega la primera arriba.</p>
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
					{@const active = entry.is_active === 1}
					<tr class:row-inactive={!active}>
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
							<span class="badge" class:badge-active={active} class:badge-inactive={!active}>
								{active ? 'Activa' : 'Inactiva'}
							</span>
						</td>
						<td class="row-actions">
							<button type="button" class="btn-link" onclick={() => startEdit(entry)}>Editar</button>
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="id" value={entry.id} />
								<input type="hidden" name="is_active" value={active ? '2' : '1'} />
								<button type="submit" class={active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
									{active ? 'Desactivar' : 'Reactivar'}
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.catalog-subtitle {
		margin: 0 0 var(--sp-4);
		font-size: var(--font-md);
		font-weight: 600;
	}

	.catalog-actions {
		flex-direction: row;
		gap: var(--sp-3);
		align-items: center;
	}

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
		vertical-align: middle;
		margin-right: var(--sp-2);
		border: 1px solid var(--border);
	}

	.color-value {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	/* Las inactivas se atenuan pero siguen legibles: hay que poder leerlas
	   para decidir si reactivarlas. */
	.row-inactive td {
		opacity: 0.6;
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
