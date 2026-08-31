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

	/* ── Diálogo: movimiento de stock ──────────────────────────────────────── */

	let moviendo = $state(false);
	let errorMovimiento = $state(null);
	let movimiento = $state({ id: null, name: '', tipo: 'entrada', cantidad: 1, notas: '', actual: 0 });

	function abrirMovimiento(item) {
		movimiento = {
			id: item.id,
			name: item.name,
			tipo: 'entrada',
			cantidad: 1,
			notas: '',
			actual: Number(item.warehouse_quantity) || 0
		};
		errorMovimiento = null;
		moviendo = true;
	}

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
					<th class="num">Precio</th>
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
						<td class="num">{formatMoney(item.rental_price ?? 0)}</td>
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
									<a
										class="row-action"
										href="/settings/articles/{item.id}"
										aria-label="Editar {item.name}"
										title="Editar en el catálogo"
									>
										<Icon name="edit" />
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
