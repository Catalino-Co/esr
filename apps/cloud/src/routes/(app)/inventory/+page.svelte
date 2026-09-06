<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { formatMoney, formatNumber } from '@esr/core';
	import { EmptyState, Icon } from '@esr/ui';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';
	import { dangerModal } from '$lib/stores/dangerModal';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
	});

	const puedeMover = $derived(can('inventory.update'));

	/** Navega conservando el resto de la query: los filtros no se pierden. */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	const opcionesCategoria = $derived([
		{ value: '', label: 'Cualquier categoría' },
		...data.categories.map((c) => ({ value: String(c.id), label: c.name }))
	]);

	/** Las tres condiciones físicas. Sentence case, como el resto del sistema. */
	/** @type {Record<string, string>} */
	const CONDICIONES = {
		disponible: 'Disponible',
		mantenimiento: 'Mantenimiento',
		retirado: 'Retirado'
	};

	const opcionesCondicion = [
		{ value: '', label: 'Cualquier condición' },
		...Object.entries(CONDICIONES).map(([value, label]) => ({ value, label }))
	];

	/* ── Dónde está repartido un artículo ──────────────────────────────────── */

	/**
	 * La distribución se pide al abrir un diálogo, no viaja con el listado: se
	 * mira de un artículo cada vez, y traerla de los cien para usar la de uno
	 * sería pagar cien veces por una.
	 */
	async function cargarDistribucion(itemId) {
		const respuesta = await fetch(`/inventory/existencias?item=${itemId}`);
		if (!respuesta.ok) return { distribution: [], serials: [], serialized: false };
		return await respuesta.json();
	}

	/* ── Diálogo: movimiento de stock ──────────────────────────────────────── */

	let moviendo = $state(false);
	let errorMovimiento = $state(null);
	let movimiento = $state({
		id: null,
		name: '',
		tipo: 'entrada',
		cantidad: 1,
		costo: '',
		notas: '',
		actual: 0,
		warehouseId: ''
	});
	/** Cuánto hay en cada almacén, para que la cifra siga al almacén elegido. */
	let repartoMovimiento = $state([]);

	const almacenMovimiento = $derived(
		data.warehouses.find((w) => String(w.id) === String(movimiento.warehouseId))?.name ?? 'este almacén'
	);

	async function abrirMovimiento(item) {
		movimiento = {
			id: item.id,
			name: item.name,
			tipo: 'entrada',
			cantidad: 1,
			// Se PROPONE el precio de compra del artículo y se guarda la copia que
			// quede aquí. Sin precio de compra entra vacío y no bloquea: «no lo sé»
			// es una respuesta válida y se guarda como tal.
			//
			// `Number(...)` y no la verdad del valor: Postgres devuelve NUMERIC como
			// CADENA, y «0.00» es una cadena no vacía. Sin esto, un artículo sin
			// precio de compra abría el diálogo con un 0.00 tecleado.
			costo: Number(item.internal_cost) > 0 ? String(item.internal_cost) : '',
			notas: '',
			actual: Number(item.warehouse_quantity) || 0,
			// Se propone el almacén que se está mirando, pero se puede cambiar aquí
			// mismo: el mismo artículo vive en varios y no hay por qué salir de la
			// pantalla para darle entrada en otro.
			warehouseId: data.warehouseId
		};
		errorMovimiento = null;
		repartoMovimiento = [];
		moviendo = true;

		repartoMovimiento = (await cargarDistribucion(item.id)).distribution;
		sincronizarActual();
	}

	/** La cifra de referencia es la del almacén ELEGIDO, no la del que se mira. */
	function sincronizarActual() {
		const fila = repartoMovimiento.find(
			(d) => String(d.warehouse_id) === String(movimiento.warehouseId)
		);
		movimiento.actual = fila ? Number(fila.quantity) || 0 : 0;
	}

	/* ── Diálogo: existencias del artículo ─────────────────────────────────── */

	let editando = $state(false);
	let errorExistencias = $state(null);
	let existencias = $state({ id: null, name: '', minimo: 0, condicion: 'disponible', ubicacion: '' });

	function abrirExistencias(item) {
		existencias = {
			id: item.id,
			name: item.name,
			minimo: Number(item.min_stock) || 0,
			condicion: item.physical_status || 'disponible',
			ubicacion: item.location ?? ''
		};
		errorExistencias = null;
		editando = true;
	}

	const alGuardarExistencias = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			errorExistencias = result.data?.error ?? 'No se pudieron guardar las existencias.';
			return;
		}
		editando = false;
	};

	/**
	 * Lo que quedará en el almacén, calculado al teclear.
	 *
	 * «Ajuste» FIJA la cantidad; entrada y salida la suman y la restan. Sin esta
	 * línea, «ajuste» se lee como «sumar» y se registra el doble de lo que se
	 * quería.
	 */
	const resultante = $derived.by(() => {
		const n = Number(movimiento.cantidad) || 0;
		if (movimiento.tipo === 'ajuste') return n;
		if (movimiento.tipo === 'entrada') return movimiento.actual + n;
		return movimiento.actual - n;
	});

	const alMover = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			// En estado propio y NO leído de `form`: `form` es único por página.
			errorMovimiento = result.data?.error ?? 'No se pudo registrar el movimiento.';
			return;
		}
		moviendo = false;
	};

	/* ── Diálogo: existencias por almacén ──────────────────────────────────── */
	//
	// La vuelta de la pantalla: aquella fija el almacén y recorre los artículos,
	// este fija el artículo y recorre los almacenes. Es lo que contesta «dónde
	// está esto», que con un artículo repartido en varios sitios no se puede
	// contestar mirando un almacén cada vez.

	let viendoReparto = $state(false);
	let repartoItem = $state({ id: null, name: '', serialized: false });
	let reparto = $state([]);
	let unidades = $state([]);
	let cargandoReparto = $state(false);
	let errorReparto = $state(null);

	async function abrirReparto(item) {
		repartoItem = { id: item.id, name: item.name, serialized: item.item_type === 'serializado' };
		reparto = [];
		unidades = [];
		errorReparto = null;
		viendoReparto = true;
		cargandoReparto = true;
		try {
			const datos = await cargarDistribucion(item.id);
			reparto = datos.distribution;
			unidades = datos.serials;
		} finally {
			cargandoReparto = false;
		}
	}

	const alMoverUnidad = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			errorReparto = result.data?.error ?? 'No se pudo mover la unidad.';
			return;
		}
		// Se recarga el reparto: la unidad ya está en otro sitio y las dos cifras
		// que se están mirando acaban de cambiar.
		const datos = await cargarDistribucion(repartoItem.id);
		reparto = datos.distribution;
		unidades = datos.serials;
	};
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/dashboard" aria-label="Volver al dashboard" title="Volver al dashboard">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar el inventario"
			title="Recargar el inventario"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>

	<div class="herramientas-datos">
		<StatusSelect
			name="almacen"
			value={data.warehouseId}
			options={data.warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
			label="Almacén"
			onchange={(e) => irCon({ almacen: e.currentTarget.value })}
		/>
		<StatusSelect
			name="category"
			value={data.categoryId}
			options={opcionesCategoria}
			label="Categoría"
			onchange={(e) => irCon({ category: e.currentTarget.value })}
		/>
		<StatusSelect
			name="condicion"
			value={data.physicalStatus}
			options={opcionesCondicion}
			label="Condición"
			onchange={(e) => irCon({ condicion: e.currentTarget.value })}
		/>
		<a class="btn-secondary" href="/movements">Movimientos</a>
		<a class="btn-secondary" href="/settings/articles">Catálogo de artículos</a>
	</div>
</div>

<section class="panel">
	<FilterBar search={{ name: 'search', placeholder: 'Nombre o código', value: data.search }}>
		{#snippet actions()}
			<!--
				«Solo stock bajo» se compara contra el TOTAL DE ESTE ALMACEN, no
				contra lo disponible hoy: responde «hay que comprar más para este
				almacén», que es una decisión de compra. Un artículo con todo
				alquilado no es stock bajo: está ocupado, y mañana vuelve.
			-->
			<label class="casilla">
				<input
					type="checkbox"
					checked={data.lowStock}
					onchange={(e) => irCon({ bajo: e.currentTarget.checked ? '1' : null })}
				/>
				<span>Solo stock bajo</span>
			</label>
		{/snippet}
	</FilterBar>

	{#if data.warehouses.length === 0}
		<EmptyState
			icon="box"
			title="Sin almacenes"
			description="El inventario se ve por almacén. Cree el primero para empezar."
			actionLabel="Ir a Almacenes"
			actionHref="/settings/warehouses"
		/>
	{:else if data.items.length === 0}
		<p class="empty-state">
			{data.lowStock
				? 'Ningún artículo está por debajo de su mínimo.'
				: 'No hay artículos para mostrar.'}
		</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Código</th>
					<th>Nombre</th>
					<th>Categoría</th>
					<th class="num">Total</th>
					<th class="num">Disponible</th>
					<th class="num">Mínimo</th>
					<th>Condición</th>
					<th class="num">Valor</th>
					<th>Proveedor</th>
					{#if puedeMover}<th><span class="sr-only">Acciones</span></th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each data.items as item (item.id)}
					{@const bajo = (item.min_stock ?? 0) > 0 && (item.warehouse_quantity ?? 0) < item.min_stock}
					{@const serializado = item.item_type === 'serializado'}
					<tr>
						<td>{item.internal_code || '—'}</td>
						<td>{item.name}</td>
						<td>{item.category_name || '—'}</td>
						<!-- Total y Disponible son la existencia FISICA de este almacen: el
						     almacen informa y no reserva, asi que sin un «reservado por
						     almacen» las dos cifras son la misma. La vista agregada de toda
						     la empresa queda para un reporte futuro. -->
						<td class="num" class:bajo>{formatNumber(item.warehouse_quantity ?? 0)}</td>
						<td class="num">
							{formatNumber(item.warehouse_quantity ?? 0)}
							{#if item.uom_abbr}<span class="uom">{item.uom_abbr}</span>{/if}
						</td>
						<td class="num">{item.min_stock ?? 0}</td>
						<td class:atencion={item.physical_status !== 'disponible'}>
							{CONDICIONES[item.physical_status ?? ''] ?? '—'}
						</td>
						<!--
							Existencias × costo, con el costo que diga la regla de la
							empresa. «—» y no cero cuando no lo hay: las entradas anteriores
							a esta reforma no guardaban costo, y un cero sería inventárselo.
						-->
						<td class="num">
							{item.valuation_cost == null
								? '—'
								: formatMoney(Number(item.valuation_cost) * Number(item.warehouse_quantity ?? 0))}
						</td>
						<td>{item.supplier_name || '—'}</td>
						{#if puedeMover}
							<td>
								<div class="row-actions">
									<button
										type="button"
										class="row-action"
										onclick={() => abrirMovimiento(item)}
										disabled={serializado}
										aria-label="Mover existencias de {item.name}"
										title={serializado
											? 'Sus existencias son sus seriales: regístrelos o retírelos desde la ficha del artículo.'
											: 'Entrada, salida o ajuste'}
									>
										<Icon name="stock" />
									</button>
									<!-- El mismo artículo puede estar repartido en varios almacenes,
									     y la tabla solo enseña uno cada vez. -->
									<button
										type="button"
										class="row-action"
										onclick={() => abrirReparto(item)}
										aria-label="Existencias por almacén de {item.name}"
										title="En qué almacenes está"
									>
										<Icon name="display" />
									</button>
									<!-- Edita las EXISTENCIAS, no la ficha: mínimo, condición y
									     ubicación. Lo que el artículo es y cuánto vale se cambia en
									     el catálogo, y desde aquí no se llega por descuido. -->
									<button
										type="button"
										class="row-action"
										onclick={() => abrirExistencias(item)}
										aria-label="Existencias de {item.name}"
										title="Mínimo, condición y ubicación"
									>
										<Icon name="edit" />
									</button>
									<!-- Abre la pantalla de movimientos YA FILTRADA por este
									     artículo; quitando el filtro allí se ve el almacén
									     entero. -->
									<a
										class="row-action"
										href="/movements?item={item.id}"
										aria-label="Historial de {item.name}"
										title="Historial de movimientos"
									>
										<Icon name="history" />
									</a>
								</div>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<!-- ── Movimiento de stock ─────────────────────────────────────────────── -->
<Modal bind:open={moviendo} size="sm" title="Movimiento de stock">
	{#if errorMovimiento}<div class="alert-error" role="alert">{errorMovimiento}</div>{/if}

	<p class="panel-hint">{movimiento.name}</p>

	<form
		id="mover-stock"
		method="POST"
		action="?/moveStock"
		class="form-grid"
		use:enhance={alMover}
	>
		<input type="hidden" name="item_id" value={movimiento.id} />

		<!--
			El almacén se ELIGE aquí, y no se hereda callado del selector de la
			barra: el mismo artículo vive en varios almacenes, y dar entrada en otro
			obligaba a cerrar esto, cambiar la barra y volver a abrirlo.
		-->
		<div class="form-field">
			<label for="mov_almacen">Almacén</label>
			<select
				id="mov_almacen"
				name="warehouse_id"
				bind:value={movimiento.warehouseId}
				onchange={sincronizarActual}
			>
				{#each data.warehouses as almacen (almacen.id)}
					<option value={String(almacen.id)}>{almacen.name}</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="mov_tipo">Tipo</label>
			<select id="mov_tipo" name="type" bind:value={movimiento.tipo}>
				<option value="entrada">Entrada</option>
				<option value="salida">Salida</option>
				<option value="ajuste">Ajuste</option>
			</select>
		</div>
		<div class="form-field">
			<label for="mov_cant">Cantidad</label>
			<input
				id="mov_cant"
				name="quantity"
				type="number"
				min="0"
				step="1"
				required
				bind:value={movimiento.cantidad}
			/>
		</div>
		<!--
			Solo en la ENTRADA: una salida no compra nada y un ajuste corrige un
			recuento. Pedir el costo en los tres ensuciaría la valoración con números
			que no son precios de compra.

			No es obligatorio: vacío significa «no lo sé» y se guarda como tal, para
			que la valoración pueda decir «—» en vez de una cifra inventada.
		-->
		{#if movimiento.tipo === 'entrada'}
			<div class="form-field">
				<label for="mov_costo">Costo unitario</label>
				<input
					id="mov_costo"
					name="unit_cost"
					type="number"
					min="0"
					step="any"
					placeholder="Sin costo"
					bind:value={movimiento.costo}
				/>
				<span class="form-hint">Se guarda en este movimiento; no cambia el artículo.</span>
			</div>
		{/if}
		<div class="form-field full">
			<label for="mov_notas">Observaciones</label>
			<input id="mov_notas" name="notes" placeholder="Motivo del movimiento" bind:value={movimiento.notas} />
		</div>
	</form>

	<p class="panel-hint resultado">
		En <strong>{almacenMovimiento}</strong> hay <strong>{formatNumber(movimiento.actual)}</strong> y
		quedarán
		<strong class:negativo={resultante < 0}>{formatNumber(resultante)}</strong>.
		{#if movimiento.tipo === 'ajuste'}
			Un ajuste fija la cantidad, no la suma.
		{/if}
	</p>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (moviendo = false)}>Cancelar</button>
		<button type="submit" form="mover-stock" class="btn-primary" disabled={resultante < 0}>
			Registrar
		</button>
	{/snippet}
</Modal>

<!-- ── Existencias por almacén ─────────────────────────────────────────── -->
<Modal bind:open={viendoReparto} size="sm" title="Existencias por almacén">
	{#if errorReparto}<div class="alert-error" role="alert">{errorReparto}</div>{/if}

	<p class="panel-hint">{repartoItem.name}</p>

	{#if cargandoReparto}
		<p class="empty-state">Cargando…</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Almacén</th>
					<th class="num">Cantidad</th>
				</tr>
			</thead>
			<tbody>
				{#each reparto as fila (fila.warehouse_id)}
					<tr>
						<td>{fila.warehouse_name}</td>
						<td class="num">{formatNumber(fila.quantity)}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<!--
			En un serializado las existencias son unidades concretas, así que
			moverlas de almacén es mover ESA unidad y no un número. Va aquí y no en
			el catálogo: allí se define qué unidades existen, aquí dónde están.
		-->
		{#if repartoItem.serialized}
			<p class="panel-hint resultado">Unidades</p>
			<table class="data-table">
				<thead>
					<tr>
						<th>Serial</th>
						<th>Estado</th>
						<th>Almacén</th>
					</tr>
				</thead>
				<tbody>
					{#each unidades as unidad (unidad.id)}
						<tr>
							<td>{unidad.serial_number}</td>
							<td>{unidad.status}</td>
							<td>
								{#if puedeMover}
									<form method="POST" action="?/moveSerial" use:enhance={alMoverUnidad}>
										<input type="hidden" name="serial_id" value={unidad.id} />
										<select
											name="warehouse_id"
											value={String(unidad.warehouse_id ?? '')}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										>
											{#if !unidad.warehouse_id}
												<option value="">Sin almacén</option>
											{/if}
											{#each data.warehouses as almacen (almacen.id)}
												<option value={String(almacen.id)}>{almacen.name}</option>
											{/each}
										</select>
									</form>
								{:else}
									{unidad.warehouse_name ?? 'Sin almacén'}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (viendoReparto = false)}>Cerrar</button>
	{/snippet}
</Modal>

<!-- ── Existencias del artículo ────────────────────────────────────────── -->
<Modal bind:open={editando} size="sm" title="Existencias del artículo">
	{#if errorExistencias}<div class="alert-error" role="alert">{errorExistencias}</div>{/if}

	<p class="panel-hint">{existencias.name}</p>

	<form
		id="guardar-existencias"
		method="POST"
		action="?/saveInventory"
		class="form-grid"
		use:enhance={alGuardarExistencias}
	>
		<input type="hidden" name="item_id" value={existencias.id} />

		<div class="form-field">
			<label for="inv_min">Mínimo</label>
			<input id="inv_min" name="min_stock" type="number" min="0" step="1" required bind:value={existencias.minimo} />
			<span class="form-hint">
				Por debajo de este total el artículo sale en «Solo stock bajo». Se compara con el
				total de este almacén, no con lo disponible hoy.
			</span>
		</div>
		<div class="form-field">
			<label for="inv_cond">Condición física</label>
			<select id="inv_cond" name="physical_status" bind:value={existencias.condicion}>
				{#each Object.entries(CONDICIONES) as [valor, etiqueta] (valor)}
					<option value={valor}>{etiqueta}</option>
				{/each}
			</select>
			<span class="form-hint">
				En qué estado está la mercancía. Si se puede cotizar o no es otra cosa, y se
				decide en el <a href="/settings/articles/{existencias.id}">catálogo</a>.
			</span>
		</div>
		<div class="form-field full">
			<label for="inv_ubic">Ubicación</label>
			<input id="inv_ubic" name="location" placeholder="Pasillo, estante, contenedor…" bind:value={existencias.ubicacion} />
		</div>
	</form>

	<p class="panel-hint resultado">
		Guardar esto no mueve ni una unidad. Para cambiar cuánto hay, use el movimiento de stock.
	</p>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (editando = false)}>Cancelar</button>
		<button type="submit" form="guardar-existencias" class="btn-primary">Guardar</button>
	{/snippet}
</Modal>

<style>
	.num {
		text-align: right;
	}

	/* La unidad NO va en `--text-placeholder`: ese token da 2.56:1 y solo vale
	   para placeholders e iconos decorativos. Esto se lee. */
	.uom {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	/* El aviso va en el TOTAL, que es contra lo que se compara el mínimo. */
	.bajo {
		color: var(--danger-text);
		font-weight: 600;
	}

	/* Una condición que no es «disponible» se marca, pero sin el rojo del stock
	   bajo: que algo esté en mantenimiento es una situación, no un problema. */
	.atencion {
		color: var(--warning-text);
		font-weight: 600;
	}

	.casilla {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--font-sm);
		white-space: nowrap;
	}

	.resultado {
		margin: var(--sp-4) 0 0;
	}

	.negativo {
		color: var(--danger-text);
	}
</style>