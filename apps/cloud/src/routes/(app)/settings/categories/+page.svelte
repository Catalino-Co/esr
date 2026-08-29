<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let editingCategory = $state(null);
	let categoryDraft = $state({});
	let editingSub = $state(null);
	let subDraft = $state({});

	const catValues = $derived(categoryDraft);
	const subValues = $derived(subDraft);

	// Las subcategorías se agrupan bajo su categoría para que la pantalla lea
	// como el árbol que realmente es.
	const tree = $derived(
		data.categories.map((category) => ({
			...category,
			children: data.subcategories.filter(
				(sub) => String(sub.category_id) === String(category.id)
			)
		}))
	);

	// Solo se puede colgar una subcategoría de una categoría activa.
	const activeCategories = $derived(data.categories.filter((c) => c.is_active === 1));

	function editCategory(category) {
		editingCategory = String(category.id);
		categoryDraft = { ...category };
	}

	function cancelCategory() {
		editingCategory = null;
		categoryDraft = {};
	}

	function editSub(sub) {
		editingSub = String(sub.id);
		subDraft = { ...sub };
	}

	function cancelSub() {
		editingSub = null;
		subDraft = {};
	}

	const afterSave = (reset) => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') reset();
	};
</script>

<section class="panel">
	<p class="panel-hint">
		Organizan el inventario. Cada categoría puede tener subcategorías; los artículos se clasifican
		con ambas.
	</p>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<h2 class="cat-subtitle">{editingCategory ? 'Editar categoría' : 'Nueva categoría'}</h2>
	<form method="POST" action="?/saveCategory" class="form-grid" use:enhance={afterSave(cancelCategory)}>
		{#if editingCategory}
			<input type="hidden" name="id" value={editingCategory} />
		{/if}
		<div class="form-field">
			<label for="cat-name">Nombre *</label>
			<input id="cat-name" name="name" required value={catValues.name ?? ''} />
		</div>
		<div class="form-field">
			<label for="cat-color">Color</label>
			<input
				id="cat-color"
				name="color"
				type="color"
				class="color-input"
				value={catValues.color ?? '#6366f1'}
			/>
		</div>
		<div class="form-actions">
			<button type="submit" class="btn-primary">
				{editingCategory ? 'Guardar cambios' : 'Agregar categoría'}
			</button>
			{#if editingCategory}
				<button type="button" class="btn-secondary" onclick={cancelCategory}>Cancelar</button>
			{/if}
		</div>
	</form>
</section>

<section class="panel">
	<h2 class="cat-subtitle">
		{editingSub ? 'Editar subcategoría' : 'Nueva subcategoría'}
	</h2>

	{#if activeCategories.length === 0}
		<p class="empty-state">Crea primero una categoría activa para poder añadir subcategorías.</p>
	{:else}
		<form method="POST" action="?/saveSubcategory" class="form-grid" use:enhance={afterSave(cancelSub)}>
			{#if editingSub}
				<input type="hidden" name="id" value={editingSub} />
			{/if}
			<div class="form-field">
				<label for="sub-category">Categoría *</label>
				<select id="sub-category" name="category_id" required>
					{#each activeCategories as category (category.id)}
						<option
							value={category.id}
							selected={String(subValues.category_id) === String(category.id)}
						>
							{category.name}
						</option>
					{/each}
				</select>
			</div>
			<div class="form-field">
				<label for="sub-name">Nombre *</label>
				<input id="sub-name" name="name" required value={subValues.name ?? ''} />
			</div>
			<div class="form-actions">
				<button type="submit" class="btn-primary">
					{editingSub ? 'Guardar cambios' : 'Agregar subcategoría'}
				</button>
				{#if editingSub}
					<button type="button" class="btn-secondary" onclick={cancelSub}>Cancelar</button>
				{/if}
			</div>
		</form>
	{/if}
</section>

<section class="panel">
	<h2 class="cat-subtitle">Árbol de categorías ({data.categories.length})</h2>

	{#if tree.length === 0}
		<p class="empty-state">Todavía no hay categorías. Agrega la primera arriba.</p>
	{:else}
		<ul class="cat-tree">
			{#each tree as category (category.id)}
				{@const active = category.is_active === 1}
				<li class="cat-node" class:node-inactive={!active}>
					<div class="cat-row">
						<span class="color-chip" style={`background:${category.color || '#6366f1'}`}></span>
						<strong>{category.name}</strong>
						<span class="badge" class:badge-active={active} class:badge-inactive={!active}>
							{active ? 'Activa' : 'Inactiva'}
						</span>
						<span class="cat-count">{category.children.length} subcategoría(s)</span>
						<span class="cat-row-actions">
							<button type="button" class="btn-link" onclick={() => editCategory(category)}>
								Editar
							</button>
							<form method="POST" action="?/toggleCategory" use:enhance>
								<input type="hidden" name="id" value={category.id} />
								<input type="hidden" name="is_active" value={active ? '2' : '1'} />
								<button type="submit" class={active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
									{active ? 'Desactivar' : 'Reactivar'}
								</button>
							</form>
						</span>
					</div>

					{#if category.children.length > 0}
						<ul class="sub-list">
							{#each category.children as sub (sub.id)}
								{@const subActive = sub.is_active === 1}
								<li class="sub-row" class:node-inactive={!subActive}>
									<span class="sub-name">{sub.name}</span>
									<span
										class="badge"
										class:badge-active={subActive}
										class:badge-inactive={!subActive}
									>
										{subActive ? 'Activa' : 'Inactiva'}
									</span>
									<span class="cat-row-actions">
										<button type="button" class="btn-link" onclick={() => editSub(sub)}>
											Editar
										</button>
										<form method="POST" action="?/toggleSubcategory" use:enhance>
											<input type="hidden" name="id" value={sub.id} />
											<input type="hidden" name="is_active" value={subActive ? '2' : '1'} />
											<button
												type="submit"
												class={subActive ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
											>
												{subActive ? 'Desactivar' : 'Reactivar'}
											</button>
										</form>
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.cat-subtitle {
		margin: 0 0 var(--sp-4);
		font-size: var(--font-md);
		font-weight: 600;
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
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.cat-tree {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.cat-node {
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		padding: var(--sp-3) var(--sp-4);
	}

	.cat-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.cat-count {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	.cat-row-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-left: auto;
	}

	.sub-list {
		list-style: none;
		margin: var(--sp-3) 0 0;
		padding: var(--sp-3) 0 0 var(--sp-5);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.sub-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.sub-name {
		font-size: var(--font-sm);
	}

	/* Lo inactivo se atenua pero sigue legible: hay que poder leerlo para
	   decidir si reactivarlo. */
	.node-inactive {
		opacity: 0.6;
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
