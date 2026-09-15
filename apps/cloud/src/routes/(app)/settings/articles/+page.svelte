<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon, FormattedNumberField } from '@esr/ui';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { stateSelect } from '$lib/list-filters';
	import { formatMoney } from '@esr/core';
	import { can } from '$lib/can';
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

	/**
	 * Clic en un encabezado sorteable: si ya es la columna activa, invierte el
	 * sentido; si no, la vuelve activa en ascendente.
	 * @param {string} campo
	 */
	function ordenarPor(campo) {
		const dir = data.sort === campo && data.dir === 'asc' ? 'desc' : 'asc';
		irCon({ sort: campo, dir });
	}

	/** @param {string} campo */
	function indicador(campo) {
		if (data.sort !== campo) return '';
		return data.dir === 'desc' ? ' ▼' : ' ▲';
	}

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
	 *
	 * `?nuevo=1` y no una variable suelta: así se puede enlazar desde fuera
	 * -el botón "+" de la ficha del artículo abre esta pantalla con el modal
	 * ya abierto-, calcado de Cotizaciones. `open` queda `$derived`, así que el
	 * `<Modal>` se monta bajo un `{#if}` en vez de con `bind:open`: no se puede
	 * enlazar un `$derived`.
	 */
	const open = $derived(page.url.searchParams.get('nuevo') === '1');

	/** @param {string | null} valor */
	function irNuevo(valor) {
		const url = new URL(page.url);
		if (valor === null) url.searchParams.delete('nuevo');
		else url.searchParams.set('nuevo', valor);
		goto(url, { noScroll: true, keepFocus: true });
	}

	let draft = $state({});
	let errorGuardar = $state(null);

	function abrirAlta() {
		draft = {};
		errorGuardar = null;
		irNuevo('1');
	}

	function cerrar() {
		draft = {};
		errorGuardar = null;
		// Solo si sigue abierto: `onclose` también se dispara al desmontarse por
		// la redirección de `alGuardar`, y ahí no hay nada que cerrar.
		if (open) irNuevo(null);
	}

	/**
	 * A diferencia de `CatalogManager` (que solo cierra), aquí tras crear se
	 * navega a la ficha: ahí es donde se termina de ubicar el artículo en
	 * existencias, y donde viven seriales/archivado que el modal no toca.
	 */
	const alGuardar = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success') {
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

	/**
	 * Las del FILTRO de la lista, no las del modal de alta: se limitan a la
	 * categoría ya elegida en la URL si hay una, pero SIN categoría muestran
	 * todas -a diferencia de `subcategoriasDisponibles`-, porque aquí filtrar
	 * por subcategoría es una decisión independiente, no un paso que dependa
	 * de haber elegido categoría primero.
	 */
	const subcategoriasFiltro = $derived(
		data.categoryId
			? data.subcategories.filter((s) => String(s.category_id) === data.categoryId)
			: data.subcategories
	);
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
		{#if can('inventory.create')}
			<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nuevo artículo</button>
		{/if}
	</div>
</div>

<section class="panel">
	<p class="panel-hint">
		Qué artículos existen y cómo se describen. Cuánto hay de cada uno y dónde está se ve en
		<a href="/inventory">Inventario</a>.
	</p>

	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre o código', value: data.search, maxWidth: '16rem' }}
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
			{
				name: 'subcategory',
				label: 'Cualquier subcategoría',
				value: data.subcategoryId,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier subcategoría' },
					...subcategoriasFiltro.map((s) => ({ value: String(s.id), label: s.name }))
				]
			}
		]}
	>
		{#snippet actions()}
			{#if data.search || data.categoryId || data.subcategoryId}
				<button
					type="button"
					class="btn-secondary btn-sm"
					onclick={() => irCon({ search: null, category: null, subcategory: null })}
				>
					Limpiar filtros
				</button>
			{/if}
		{/snippet}
	</FilterBar>

	{#if data.items.length === 0}
		<p class="empty-state">No hay artículos para mostrar.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th><button type="button" class="th-sort" onclick={() => ordenarPor('code')}>Código{indicador('code')}</button></th>
					<th><button type="button" class="th-sort" onclick={() => ordenarPor('name')}>Nombre{indicador('name')}</button></th>
					<th><button type="button" class="th-sort" onclick={() => ordenarPor('category')}>Categoría{indicador('category')}</button></th>
					<th><button type="button" class="th-sort" onclick={() => ordenarPor('unit')}>Unidad{indicador('unit')}</button></th>
					<th><button type="button" class="th-sort" onclick={() => ordenarPor('subcategory')}>Subcategoría{indicador('subcategory')}</button></th>
					<th class="num"><button type="button" class="th-sort" onclick={() => ordenarPor('price')}>Precio alquiler{indicador('price')}</button></th>
					<!-- «Publicación» y no «Estado»: aquí se decide si el artículo se
					     puede cotizar, no si la mercancía está sana. Esa otra es la
					     condición física y vive en Inventario. -->
					<th><button type="button" class="th-sort" onclick={() => ordenarPor('state')}>Publicación{indicador('state')}</button></th>
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
						<td>{item.subcategory_name}</td>
						<td class="num">{formatMoney(item.rental_price ?? 0)}</td>
						<td>{ESTADOS[item.is_active ?? -1] ?? '—'}</td>
						<td><a class="btn-edit" href="/settings/articles/{item.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

{#if open}
<Modal open size="lg" title="Nuevo artículo" onclose={cerrar}>
	{#if errorGuardar}
		<div class="alert-error" role="alert">{errorGuardar}</div>
	{/if}

	<form id="articulo-form" method="POST" action="?/create" class="form-grid form-grid--3" use:enhance={alGuardar}>
		<div class="form-field">
			<label for="a-internal_code">Código / SKU</label>
			<input id="a-internal_code" name="internal_code" value={values.internal_code ?? ''} />
			<span class="form-hint">Si se deja en blanco, se genera uno a partir de la categoría.</span>
		</div>
		<div class="form-field span-2">
			<label for="a-name">Nombre *</label>
			<input id="a-name" name="name" value={values.name ?? ''} required />
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

		<!-- Los dos precios VIGENTES, juntos y dichos por su nombre. Son valores
		     por defecto: cada transacción copia el que necesita al hacerse, así
		     que cambiarlos aquí no reescribe ninguna ya emitida. -->
		<div class="form-field">
			<label for="a-rental_price">Precio de alquiler</label>
			<FormattedNumberField
				id="a-rental_price"
				name="rental_price"
				min={0}
				value={values.rental_price ?? 0}
			/>
		</div>
		<div class="form-field">
			<label for="a-internal_cost">Precio de compra</label>
			<FormattedNumberField
				id="a-internal_cost"
				name="internal_cost"
				min={0}
				value={values.internal_cost ?? 0}
			/>
			<span class="form-hint">Se propone como costo unitario al registrar una entrada.</span>
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
		<button type="button" class="btn-secondary" onclick={cerrar}><Icon name="x" size={16} />Cancelar</button>
		<button type="submit" form="articulo-form" class="btn-primary"><Icon name="check" size={16} />Crear artículo</button>
	{/snippet}
</Modal>
{/if}

<style>
	.num {
		text-align: right;
	}

	/* Tres columnas fijas y no `auto-fit`: con ocho campos, el reparto
	   irregular de `.form-grid` (que a veces cae en 2 columnas, a veces en 3)
	   dejaba el formulario más alto y menos compacto de lo necesario. `.full`
	   de `theme.css` sigue funcionando igual encima: `grid-column: 1 / -1` no
	   depende de cuántas columnas tenga el grid. */
	.form-grid--3 {
		grid-template-columns: repeat(3, 1fr);
	}

	/* Nombre ocupa el ancho que antes usaba Categoría, para que el código
	   -corto- y el nombre -largo- no compitan por la misma columna. `span 2`
	   y no una tercera clase de grid: el resto del formulario sigue en 3
	   columnas iguales, solo esta fila cambia el reparto. */
	.form-field.span-2 {
		grid-column: span 2;
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
