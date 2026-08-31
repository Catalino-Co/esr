<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatMoney, formatNumber } from '@esr/core';
	import { EmptyState, Icon } from '@esr/ui';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

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

	/** Las tres condiciones físicas. Sentence case, como el resto del sistema. */
	/** @type {Record<string, string>} */
	const CONDICIONES = {
		disponible: 'Disponible',
		mantenimiento: 'Mantenimiento',
		retirado: 'Retirado'
	};

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
		actual: 0
	});

	function abrirMovimiento(item) {
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
			actual: Number(item.warehouse_quantity) || 0
		};
		errorMovimiento = null;
		moviendo = true;
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
</script>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre o código', value: data.search }}
		selects={[
			{
				name: 'almacen',
				label: 'Almacén',
				value: data.warehouseId,
				width: '12rem',
				options: data.warehouses.map((w) => ({ value: String(w.id), label: w.name }))
			},
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
				name: 'condicion',
				label: 'Cualquier condición',
				value: data.physicalStatus,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier condición' },
					...Object.entries(CONDICIONES).map(([value, label]) => ({ value, label }))
				]
			}
		]}
	>
		{#snippet actions()}
			<!--
				«Solo stock bajo» se compara contra el TOTAL de la empresa, no contra
				lo disponible hoy: responde «hay que comprar más», que es una decisión
				de compra. Un artículo con todo alquilado no es stock bajo: está
				ocupado, y mañana vuelve.
			-->
			<label class="casilla">
				<input
					type="checkbox"
					checked={data.lowStock}
					onchange={(e) => irCon({ bajo: e.currentTarget.checked ? '1' : null })}
				/>
				<span>Solo stock bajo</span>
			</label>
			<a class="btn-secondary" href="/movements">Movimientos</a>
			<a class="btn-secondary" href="/settings/articles">Catálogo de artículos</a>
		{/snippet}
	</FilterBar>

	{#if form?.error}
		<p class="alert-error aviso" role="alert">{form.error}</p>
	{/if}

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
		<table class="data-table">
			<thead>
				<tr>
					<th>Código</th>
					<th>Nombre</th>
					<th>Categoría</th>
					<th class="num">En almacén</th>
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
					{@const bajo = (item.min_stock ?? 0) > 0 && (item.total_quantity ?? 0) < item.min_stock}
					{@const serializado = item.item_type === 'serializado'}
					<tr>
						<td>{item.internal_code || '—'}</td>
						<td>{item.name}</td>
						<td>{item.category_name || '—'}</td>
						<td class="num">{formatNumber(item.warehouse_quantity ?? 0)}</td>
						<td class="num" class:bajo>{formatNumber(item.total_quantity ?? 0)}</td>
						<!-- La unidad acompaña a lo DISPONIBLE, que es la cifra con la que
						     se decide si se puede comprometer algo. -->
						<td class="num">
							{formatNumber(item.available_quantity ?? 0)}
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
		<input type="hidden" name="warehouse_id" value={data.warehouseId} />

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
		En este almacén hay <strong>{formatNumber(movimiento.actual)}</strong> y quedarán
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
				total de la empresa, no con lo disponible hoy.
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

	.aviso {
		margin: 0 0 var(--sp-4);
	}

	.resultado {
		margin: var(--sp-4) 0 0;
	}

	.negativo {
		color: var(--danger-text);
	}
</style>