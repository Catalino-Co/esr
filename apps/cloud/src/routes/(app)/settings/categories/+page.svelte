<script>
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';

	let { data, form } = $props();

	// Dos dialogos independientes: categoria y subcategoria.
	let openCat = $state(false);
	let openSub = $state(false);
	let editingCategory = $state(null);
	let categoryDraft = $state({});
	let editingSub = $state(null);
	let subDraft = $state({});

	/**
	 * Errores en estado propio, uno por dialogo. `form` es unico por pagina y
	 * lo escriben tambien los cuatro `?/toggle*` del arbol, asi que leerlo aqui
	 * haria que desactivar una rama pintase su mensaje dentro del dialogo.
	 */
	let errorCat = $state(null);
	let errorSub = $state(null);

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

	function newCategory() {
		editingCategory = null;
		categoryDraft = {};
		errorCat = null;
		openCat = true;
	}

	function editCategory(category) {
		editingCategory = String(category.id);
		categoryDraft = { ...category };
		errorCat = null;
		openCat = true;
	}

	function cancelCategory() {
		openCat = false;
		editingCategory = null;
		categoryDraft = {};
		errorCat = null;
	}

	function newSub() {
		editingSub = null;
		subDraft = {};
		errorSub = null;
		openSub = true;
	}

	function editSub(sub) {
		editingSub = String(sub.id);
		subDraft = { ...sub };
		errorSub = null;
		openSub = true;
	}

	function cancelSub() {
		openSub = false;
		editingSub = null;
		subDraft = {};
		errorSub = null;
	}

	/**
	 * `cerrar` en exito; en error el dialogo se queda abierto con lo tecleado.
	 * Los valores se copian al draft desde la respuesta, no se leen de `form`:
	 * asi el dialogo arranca limpio la proxima vez que se abra.
	 *
	 * Ojo con los TRES niveles de funcion: `use:enhance` recibe la funcion de
	 * ENVIO, que se llama con `{ form, data, cancel }` y devuelve el callback
	 * que recibe `{ result, update }`. Con un nivel menos —como estaba antes de
	 * los dialogos— el callback se pasaba como funcion de envio, `update` y
	 * `result` llegaban `undefined` y el `await update(...)` reventaba en
	 * silencio: por eso el reset y el cierre nunca llegaban a ejecutarse.
	 */
	const afterSave = (cerrar, setError, setDraft) => () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrar();
			return;
		}
		if (result.data?.values) setDraft(result.data.values);
		setError(result.data?.error ?? 'No se pudo guardar.');
	};
</script>

<section class="panel">
	<div class="page-header">
		<div class="cat-header-actions">
			<button type="button" class="btn-secondary" onclick={newSub} disabled={activeCategories.length === 0}>
				Nueva subcategoría
			</button>
			<button type="button" class="btn-primary" onclick={newCategory}>Nueva categoría</button>
		</div>
	</div>

	<p class="panel-hint">
		Organizan el inventario. Cada categoría puede tener subcategorías; los artículos se clasifican
		con ambas.
	</p>

	<!-- Los mensajes se callan con cualquier dialogo abierto: su error va dentro. -->
	{#if !openCat && !openSub}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="alert-success" role="status">{form.success}</div>
		{/if}
	{/if}

	<h2 class="cat-subtitle">Árbol de categorías ({data.categories.length})</h2>

	{#if tree.length === 0}
		<p class="empty-state">Todavía no hay categorías. Agrega la primera con «Nueva categoría».</p>
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

<Modal bind:open={openCat} size="sm" title={editingCategory ? 'Editar categoría' : 'Nueva categoría'} onclose={cancelCategory}>
	{#if errorCat}
		<div class="alert-error" role="alert">{errorCat}</div>
	{/if}

	<form
		id="cat-form"
		method="POST"
		action="?/saveCategory"
		class="form-grid"
		use:enhance={afterSave(cancelCategory, (m) => (errorCat = m), (v) => (categoryDraft = v))}
	>
		{#if editingCategory}
			<input type="hidden" name="id" value={editingCategory} />
		{/if}
		<div class="form-field full">
			<label for="cat-name">Nombre *</label>
			<input id="cat-name" name="name" required value={catValues.name ?? ''} />
		</div>
		<div class="form-field full">
			<label for="cat-color">Color</label>
			<input
				id="cat-color"
				name="color"
				type="color"
				class="color-input"
				value={catValues.color ?? '#6366f1'}
			/>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cancelCategory}>Cancelar</button>
		<button type="submit" form="cat-form" class="btn-primary">
			{editingCategory ? 'Guardar cambios' : 'Agregar categoría'}
		</button>
	{/snippet}
</Modal>

<Modal bind:open={openSub} size="sm" title={editingSub ? 'Editar subcategoría' : 'Nueva subcategoría'} onclose={cancelSub}>
	{#if errorSub}
		<div class="alert-error" role="alert">{errorSub}</div>
	{/if}

	<form
		id="sub-form"
		method="POST"
		action="?/saveSubcategory"
		class="form-grid"
		use:enhance={afterSave(cancelSub, (m) => (errorSub = m), (v) => (subDraft = v))}
	>
		{#if editingSub}
			<input type="hidden" name="id" value={editingSub} />
		{/if}
		<div class="form-field full">
			<label for="sub-category">Categoría *</label>
			<select id="sub-category" name="category_id" required>
				{#each activeCategories as category (category.id)}
					<option value={category.id} selected={String(subValues.category_id) === String(category.id)}>
						{category.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field full">
			<label for="sub-name">Nombre *</label>
			<input id="sub-name" name="name" required value={subValues.name ?? ''} />
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cancelSub}>Cancelar</button>
		<button type="submit" form="sub-form" class="btn-primary">
			{editingSub ? 'Guardar cambios' : 'Agregar subcategoría'}
		</button>
	{/snippet}
</Modal>

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
