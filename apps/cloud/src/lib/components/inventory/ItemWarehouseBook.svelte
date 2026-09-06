<script>
	import { enhance } from '$app/forms';
	import { formatNumber } from '@esr/core';
	import { dangerModal } from '$lib/stores/dangerModal';

	/**
	 * En qué almacenes vive UN artículo, con la capacidad de decidirlo: dar
	 * entrada en uno nuevo, trasladar entre dos, o quitarlo de uno que ya se
	 * quedó en cero. Antes esto solo existía medio escondido en el modal
	 * «Existencias por almacén» de Inventario; aquí vive junto al resto de la
	 * ficha del artículo, que es donde se decide.
	 *
	 * Para SERIALIZADOS la tabla es informativa: la existencia son sus
	 * unidades, y el traslado real ocurre reasignando el almacén de cada una
	 * en la tabla de seriales de abajo, no aquí.
	 */
	let {
		distribution = [],
		warehouses = [],
		isSerialized = false,
		searchTerm = '',
		form = null
	} = $props();

	const mensaje = $derived(form?.scope === 'almacenes' ? form : null);

	$effect(() => {
		if (mensaje?.error) dangerModal.show(mensaje.error);
	});

	let trasladando = $state(null); // warehouse_id de origen, o null

	function alternarTraslado(warehouseId) {
		trasladando = trasladando === warehouseId ? null : warehouseId;
	}

	const alEnviar = () => async ({ update }) => {
		await update({ reset: false });
		trasladando = null;
	};
</script>

<section class="panel">
	<div class="book-header">
		<div>
			<h2>Almacenes</h2>
			<p class="panel-hint">En qué almacenes está este artículo y cuánto hay en cada uno.</p>
		</div>
	</div>

	{#if distribution.length === 0}
		<p class="empty-state">No hay almacenes creados.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Almacén</th>
					<th class="num">Cantidad</th>
					<th><span class="sr-only">Acciones</span></th>
				</tr>
			</thead>
			<tbody>
				{#each distribution as fila (fila.warehouse_id)}
					<tr>
						<td>{fila.warehouse_name}</td>
						<td class="num">{formatNumber(fila.quantity)}</td>
						<td class="row-actions">
							<a
								class="btn-secondary btn-sm"
								href="/inventory?almacen={fila.warehouse_id}&search={encodeURIComponent(searchTerm)}"
							>
								Ver en Inventario
							</a>
							{#if !isSerialized}
								{#if fila.quantity > 0}
									<button
										type="button"
										class="btn-secondary btn-sm"
										onclick={() => alternarTraslado(fila.warehouse_id)}
									>
										Trasladar
									</button>
								{:else}
									<form method="POST" action="?/removeFromWarehouse" use:enhance={alEnviar}>
										<input type="hidden" name="warehouse_id" value={fila.warehouse_id} />
										<button type="submit" class="btn-danger btn-sm">Quitar</button>
									</form>
								{/if}
							{/if}
						</td>
					</tr>
					{#if trasladando === fila.warehouse_id}
						<tr>
							<td colspan="3">
								<form
									method="POST"
									action="?/transferStock"
									class="sunken-card inline-form"
									use:enhance={alEnviar}
								>
									<input type="hidden" name="from_warehouse_id" value={fila.warehouse_id} />
									<div class="form-field">
										<label for="to-warehouse-{fila.warehouse_id}">A</label>
										<select id="to-warehouse-{fila.warehouse_id}" name="to_warehouse_id" required>
											{#each warehouses.filter((w) => String(w.id) !== String(fila.warehouse_id)) as almacen (almacen.id)}
												<option value={almacen.id}>{almacen.name}</option>
											{/each}
										</select>
									</div>
									<div class="form-field">
										<label for="qty-warehouse-{fila.warehouse_id}">Cantidad</label>
										<input
											id="qty-warehouse-{fila.warehouse_id}"
											name="quantity"
											type="number"
											min="1"
											max={fila.quantity}
											step="1"
											value={fila.quantity}
											required
										/>
									</div>
									<div class="form-field form-field--action">
										<button type="submit" class="btn-primary btn-sm">Trasladar</button>
									</div>
								</form>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.book-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.book-header h2 {
		margin: 0 0 4px;
		font-size: var(--font-lg);
	}

	.book-header .panel-hint {
		margin: 0;
	}

	.num {
		text-align: right;
	}

	.inline-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.inline-form .form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 8rem;
	}

	.row-actions {
		text-align: right;
		white-space: nowrap;
	}
</style>
