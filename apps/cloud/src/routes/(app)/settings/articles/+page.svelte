<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { stateSelect } from '$lib/list-filters';
	import { formatMoney } from '@esr/core';
	import { can } from '$lib/can';
	let { data, form } = $props();

	/**
	 * Los tres estados de circulación, escritos aquí y no traídos de
	 * `RECORD_STATE_LABELS`, porque en esta columna se leen como una propiedad
	 * del artículo —«¿se puede cotizar?»— y no como el nombre de una acción.
	 */
	/** @type {Record<number, string>} */
	const ESTADOS = { 1: 'Activo', 2: 'Inactivo', 0: 'Archivado' };

	/*
	 * Alta en MODAL sobre el propio listado, calcada de `CatalogManager.svelte`
	 * (Proveedores, Tipos de evento, etc.). Solo alta: la edición sigue viviendo
	 * en su propia ruta `/settings/articles/[id]`, que además necesita seriales,
	 * archivado y más — eso no se muda aquí.
	 */
	let open = $state(false);
	let draft = $state({});
	let errorGuardar = $state(null);

	function abrirAlta() {
		draft = {};
		errorGuardar = null;
		open = true;
	}

	function cerrar() {
		open = false;
		draft = {};
		errorGuardar = null;
	}

	/**
	 * A diferencia de `CatalogManager` (que solo cierra), aquí tras crear se
	 * navega a la ficha: ahí es donde se termina de ubicar el artículo en
	 * existencias, y donde viven seriales/archivado que el modal no toca.
	 */
	const alGuardar = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success') {
			open = false;
			goto(`/settings/articles/${result.data.id}`);
		} else {
			errorGuardar = result.data?.error ?? 'No se pudo guardar.';
		}
	};

	const values = $derived(form?.values ?? draft);

	/**
	 * Estado propio y no derivado de `values`: el `<select>` de categoría no
	 * lleva `bind:value` (el resto del formulario tampoco, calcado de
	 * `CatalogManager`), así que sin esto elegir una categoría no movería ni
	 * una opción del select de subcategoría hasta el siguiente submit.
	 */
	let categoriaElegida = $state('');
	$effect(() => {
		if (open) categoriaElegida = String(values.category_id ?? '');
	});

	/** Solo las subcategorías de la categoría elegida. Sin categoría, ninguna. */
	const subcategoriasDisponibles = $derived(
		categoriaElegida
			? data.subcategories.filter((s) => String(s.category_id) === categoriaElegida)
			: []
	);
</script>

<section class="panel">
	<p class="panel-hint">
		Qué artículos existen y cómo se describen. Cuánto hay de cada uno y dónde está se ve en
		<a href="/inventory">Inventario</a>.
	</p>

	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre o código', value: data.search }}
		selects={[
			{
				name: 'category',
				label: 'Cualquier categoría',
				value: data.categoryId,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier categoría' },
					...data.categories.map((c) => ({ value: String(c.id), label: c.name }))
				]
			},
			stateSelect(data.state)
		]}
	>
		{#snippet actions()}
			{#if can('inventory.create')}
				<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nuevo artículo</button>
			{/if}
		{/snippet}
	</FilterBar>

	{#if data.items.length === 0}
		<p class="empty-state">No hay artículos para mostrar.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Código</th>
					<th>Nombre</th>
					<th>Categoría</th>
					<th>Unidad</th>
					<th>Proveedor</th>
					<th class="num">Precio alquiler</th>
					<!-- «Publicación» y no «Estado»: aquí se decide si el artículo se
					     puede cotizar, no si la mercancía está sana. Esa otra es la
					     condición física y vive en Inventario. -->
					<th>Publicación</th>
					<th><span class="sr-only">Acciones</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.items as item (item.id)}
					<tr>
						<td>{item.internal_code || '—'}</td>
						<td>{item.name}</td>
						<td>{item.category_name}</td>
						<td>{item.uom_abbr || '—'}</td>
						<td>{item.supplier_name}</td>
						<td class="num">{formatMoney(item.rental_price ?? 0)}</td>
						<td>{ESTADOS[item.is_active ?? -1] ?? '—'}</td>
						<td><a class="btn-edit" href="/settings/articles/{item.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal bind:open size="lg" title="Nuevo artículo" onclose={cerrar}>
	{#if errorGuardar}
		<div class="alert-error" role="alert">{errorGuardar}</div>
	{/if}

	<form id="articulo-form" method="POST" action="?/create" class="form-grid" use:enhance={alGuardar}>
		<div class="form-field full sec-titulo">
			<h2 class="sec-title">Identificación</h2>
		</div>
		<div class="form-field">
			<label for="a-name">Nombre *</label>
			<input id="a-name" name="name" value={values.name ?? ''} required />
		</div>
		<div class="form-field">
			<label for="a-internal_code">Código / SKU</label>
			<input id="a-internal_code" name="internal_code" value={values.internal_code ?? ''} />
		</div>

		<div class="form-field full sec-titulo">
			<h2 class="sec-title">Clasificación</h2>
		</div>
		<div class="form-field">
			<label for="a-category_id">Categoría</label>
			<select
				id="a-category_id"
				name="category_id"
				value={values.category_id ?? ''}
				onchange={(e) => (categoriaElegida = e.currentTarget.value)}
			>
				<option value="">Sin categoría</option>
				{#each data.categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="a-subcategory_id">Subcategoría</label>
			<select id="a-subcategory_id" name="subcategory_id" disabled={!categoriaElegida}>
				<option value="">Sin subcategoría</option>
				{#each subcategoriasDisponibles as subcategory (subcategory.id)}
					<option value={subcategory.id} selected={String(values.subcategory_id) === String(subcategory.id)}>
						{subcategory.name}
					</option>
				{/each}
			</select>
			{#if !categoriaElegida}
				<span class="form-hint">Elija una categoría primero.</span>
			{/if}
		</div>
		<div class="form-field">
			<label for="a-supplier_id">Proveedor</label>
			<select id="a-supplier_id" name="supplier_id" value={values.supplier_id ?? ''}>
				<option value="">(Ninguno)</option>
				{#each data.suppliers as proveedor (proveedor.id)}
					<option value={proveedor.id}>{proveedor.name}</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="a-uom_id">Unidad de medida</label>
			<select id="a-uom_id" name="uom_id" value={values.uom_id ?? ''}>
				<option value="">(Ninguna)</option>
				{#each data.units as unidad (unidad.id)}
					<option value={unidad.id}>{unidad.name}{unidad.abbr ? ` (${unidad.abbr})` : ''}</option>
				{/each}
			</select>
		</div>

		<!--
			Los dos precios VIGENTES, juntos y dichos por su nombre. Son valores por
			defecto: cada transacción copia el que necesita al hacerse, así que
			cambiarlos aquí no reescribe ninguna ya emitida.
		-->
		<div class="form-field full sec-titulo">
			<h2 class="sec-title">Precios vigentes</h2>
			<span class="form-hint">
				Se proponen al cotizar y al registrar una entrada. Cada documento guarda su
				propia copia, así que cambiarlos aquí no altera nada ya emitido.
			</span>
		</div>
		<div class="form-field">
			<label for="a-rental_price">Precio de alquiler</label>
			<input
				id="a-rental_price"
				name="rental_price"
				type="number"
				min="0"
				step="any"
				value={values.rental_price ?? 0}
			/>
		</div>
		<div class="form-field">
			<label for="a-internal_cost">Precio de compra</label>
			<input
				id="a-internal_cost"
				name="internal_cost"
				type="number"
				min="0"
				step="any"
				value={values.internal_cost ?? 0}
			/>
			<span class="form-hint">Se propone como costo unitario al registrar una entrada.</span>
		</div>

		<div class="form-field full sec-titulo">
			<h2 class="sec-title">Notas</h2>
		</div>
		<div class="form-field full">
			<label for="a-notes">Notas</label>
			<textarea id="a-notes" name="notes" rows="2">{values.notes ?? ''}</textarea>
		</div>
	</form>

	<div class="nota">
		<p class="nota-titulo">💡 Nota</p>
		<p>
			Nace sin existencias. Para darle stock, regístrele una entrada en
			<a href="/inventory">Inventario</a>: así queda constancia de a qué almacén entró, a
			qué costo y quién la registró.
		</p>
	</div>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrar}>Cancelar</button>
		<button type="submit" form="articulo-form" class="btn-primary">Crear artículo</button>
	{/snippet}
</Modal>

<style>
	.num {
		text-align: right;
	}

	.sec-title {
		margin: 0 0 var(--sp-1);
		font-size: var(--font-md);
		font-weight: 600;
	}

	.sec-titulo {
		margin-top: var(--sp-3);
		border-top: 1px solid var(--border);
		padding-top: var(--sp-4);
	}
	.sec-titulo:first-child {
		margin-top: 0;
		border-top: none;
		padding-top: 0;
	}

	.nota {
		margin-top: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: var(--success-bg);
		border: 1px solid var(--success);
		border-radius: var(--border-radius-sm);
		color: var(--success-text);
		font-size: var(--font-sm);
	}
	.nota-titulo {
		margin: 0 0 var(--sp-1);
		font-weight: 700;
	}
	.nota p:last-child {
		margin-bottom: 0;
	}
</style>
