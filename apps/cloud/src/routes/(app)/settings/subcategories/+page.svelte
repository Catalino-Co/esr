<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import { recordStateBadgeClass, recordStateLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { stateFormOptions, stateSelect } from '$lib/list-filters';
	import { dangerModal } from '$lib/stores/dangerModal';
	import { toasts } from '$lib/stores/toasts';

	let { data, form } = $props();

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	/** @param {Record<string, string | null>} cambios */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	/* Antes este aviso solo se pintaba con el dialogo cerrado (`{#if !open}`),
	   para no dejarlo asomando detras. El efecto ya resuelve eso solo: dispara
	   UNA vez cuando `form` cambia de verdad, sin importar si el dialogo esta
	   abierto en ese instante. */
	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
		if (form?.success) toasts.success(form.success);
	});

	let open = $state(false);
	let editando = $state(null);
	let borrador = $state({});
	/** Error propio, no leido de `form`, que comparte con el toggle de la fila. */
	let errorGuardar = $state(null);

	const editando_ = $derived(editando !== null);

	/** Filtro por categoría padre. Es el eje natural de esta pantalla. */
	const categorySelect = $derived({
		name: 'category',
		label: 'Categoría',
		value: data.categoryId,
		options: [
			{ value: '', label: 'Todas las categorías' },
			...data.categories.map((c) => ({ value: String(c.id), label: c.name }))
		],
		width: '13rem'
	});

	function abrirAlta() {
		editando = null;
		// Si hay una categoría filtrada, se hereda: es lo que el usuario mira.
		borrador = { is_active: 1, category_id: data.categoryId || '' };
		errorGuardar = null;
		open = true;
	}

	function abrirEdicion(sub) {
		editando = String(sub.id);
		borrador = { ...sub };
		errorGuardar = null;
		open = true;
	}

	function cerrar() {
		open = false;
		editando = null;
		borrador = {};
		errorGuardar = null;
	}

	const alGuardar = () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
		if (result.type === 'success') {
			cerrar();
			return;
		}
		if (result.data?.values) borrador = { ...borrador, ...result.data.values };
		errorGuardar = result.data?.error ?? 'No se pudo guardar.';
	};
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar la lista"
			title="Recargar la lista"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>
	<div class="herramientas-datos">
		<StatusSelect
			{...stateSelect(data.state)}
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ state: e.currentTarget.value })}
		/>
		<button
			type="button"
			class="btn-primary btn-new"
			onclick={abrirAlta}
			disabled={data.categories.length === 0}
		>
			Nueva subcategoría
		</button>
	</div>
</div>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre o categoría', value: data.search }}
		selects={[categorySelect]}
	/>

	{#if data.categories.length === 0}
		<p class="empty-state">
			Crea primero una categoría en <a href="/settings/categories">Categorías</a>: una subcategoría
			siempre cuelga de una.
		</p>
	{:else if data.subcategories.length === 0}
		<p class="empty-state">No hay subcategorías con este filtro.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Descripción</th>
					<th>Categoría</th>
					<th>Estado</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each data.subcategories as sub (sub.id)}
					{@const activa = sub.is_active === 1}
					<tr>
						<td>{sub.name}</td>
						<td class="celda-padre">
							<span class="color-chip" style={`background:${sub.category_color || '#6366f1'}`}></span>
							{sub.category_name}
						</td>
						<td>
							<span class="badge {recordStateBadgeClass(sub.is_active)}">
								{recordStateLabel(sub.is_active)}
							</span>
						</td>
						<td class="row-actions">
							<button type="button" class="btn-edit" onclick={() => abrirEdicion(sub)}>Editar</button>
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="id" value={sub.id} />
								<input type="hidden" name="is_active" value={activa ? '2' : '1'} />
								<button type="submit" class={activa ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
									{activa ? 'Desactivar' : 'Reactivar'}
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal
	bind:open
	size="sm"
	title={editando_ ? 'Editar subcategoría' : 'Nueva subcategoría'}
	onclose={cerrar}
>
	{#if errorGuardar}
		<div class="alert-error" role="alert">{errorGuardar}</div>
	{/if}

	<form id="sub-form" method="POST" action="?/save" class="form-grid" use:enhance={alGuardar}>
		{#if editando_}
			<input type="hidden" name="id" value={editando} />
		{/if}
		<div class="form-field full">
			<label for="sub-category">Categoría *</label>
			<select id="sub-category" name="category_id" required>
				<option value="" disabled selected={!borrador.category_id}>Seleccione una…</option>
				{#each data.categories as category (category.id)}
					<option
						value={category.id}
						selected={String(borrador.category_id ?? '') === String(category.id)}
					>
						{category.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="form-field full">
			<label for="sub-name">Nombre *</label>
			<input id="sub-name" name="name" required value={borrador.name ?? ''} />
		</div>
		<div class="form-field full">
			<label for="sub-state">Estado</label>
			<select id="sub-state" name="is_active">
				{#each stateFormOptions() as opcion (opcion.value)}
					<option
						value={opcion.value}
						selected={String(borrador.is_active ?? 1) === String(opcion.value)}
					>
						{opcion.label}
					</option>
				{/each}
			</select>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrar}>Cancelar</button>
		<button type="submit" form="sub-form" class="btn-primary">
			{editando_ ? 'Guardar cambios' : 'Agregar subcategoría'}
		</button>
	{/snippet}
</Modal>

<style>
	.celda-padre {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.color-chip {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 4px;
		flex-shrink: 0;
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
