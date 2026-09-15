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
	/**
	 * Error propio, NO leido de `form`: el `?/toggleCategory` de cada fila
	 * escribe en el mismo objeto y acabaria pintandose dentro del dialogo.
	 */
	let errorGuardar = $state(null);

	const editando_ = $derived(editando !== null);

	// Cuantas subcategorias cuelgan de cada una, para que la tabla lo diga.
	const cuentaHijas = $derived(
		data.subcategories.reduce((acc, sub) => {
			const k = String(sub.category_id);
			acc[k] = (acc[k] ?? 0) + 1;
			return acc;
		}, {})
	);

	function abrirAlta() {
		editando = null;
		borrador = { is_active: 1 };
		errorGuardar = null;
		open = true;
	}

	function abrirEdicion(category) {
		editando = String(category.id);
		borrador = { ...category };
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
		<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nueva categoría</button>
	</div>
</div>

<section class="panel">
	<FilterBar search={{ name: 'search', placeholder: 'Nombre de la categoría', value: data.search }} />

	{#if data.categories.length === 0}
		<p class="empty-state">No hay categorías con este filtro.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Descripción</th>
					<th>Subcategorías</th>
					<th>Estado</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each data.categories as category (category.id)}
					{@const activa = category.is_active === 1}
					<tr>
						<td class="celda-nombre">
							<span class="color-chip" style={`background:${category.color || '#6366f1'}`}></span>
							{category.name}
						</td>
						<td>{cuentaHijas[String(category.id)] ?? 0}</td>
						<td>
							<span class="badge {recordStateBadgeClass(category.is_active)}">
								{recordStateLabel(category.is_active)}
							</span>
						</td>
						<td class="row-actions">
							<button type="button" class="btn-edit" onclick={() => abrirEdicion(category)}>
								Editar
							</button>
							<form method="POST" action="?/toggleCategory" use:enhance>
								<input type="hidden" name="id" value={category.id} />
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

<Modal bind:open size="sm" title={editando_ ? 'Editar categoría' : 'Nueva categoría'} onclose={cerrar}>
	{#if errorGuardar}
		<div class="alert-error" role="alert">{errorGuardar}</div>
	{/if}

	<form
		id="cat-form"
		method="POST"
		action="?/saveCategory"
		class="form-grid"
		use:enhance={alGuardar}
	>
		{#if editando_}
			<input type="hidden" name="id" value={editando} />
		{/if}
		<div class="form-field full">
			<label for="cat-name">Nombre *</label>
			<input id="cat-name" name="name" required value={borrador.name ?? ''} />
		</div>
		<div class="form-field full">
			<label for="cat-color">Color</label>
			<input
				id="cat-color"
				name="color"
				type="color"
				class="color-input"
				value={borrador.color ?? '#6366f1'}
			/>
		</div>
		<div class="form-field full">
			<label for="cat-state">Estado</label>
			<select id="cat-state" name="is_active">
				{#each stateFormOptions() as opcion (opcion.value)}
					<option value={opcion.value} selected={String(borrador.is_active ?? 1) === String(opcion.value)}>
						{opcion.label}
					</option>
				{/each}
			</select>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrar}><Icon name="x" size={16} />Cancelar</button>
		<button type="submit" form="cat-form" class="btn-primary">
			<Icon name="check" size={16} />{editando_ ? 'Guardar cambios' : 'Agregar categoría'}
		</button>
	{/snippet}
</Modal>

<style>
	.celda-nombre {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.color-chip {
		display: inline-block;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		flex-shrink: 0;
	}

	.color-input {
		padding: 2px;
		height: 38px;
		cursor: pointer;
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
