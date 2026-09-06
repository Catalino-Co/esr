<script>
	import { Icon } from '@esr/ui';
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { recordStateBadgeClass, recordStateLabel } from '@esr/core';
	import ItemSupplierBook from '$lib/components/inventory/ItemSupplierBook.svelte';
	import ItemWarehouseBook from '$lib/components/inventory/ItemWarehouseBook.svelte';
	import { dangerModal } from '$lib/stores/dangerModal';
	import { toasts } from '$lib/stores/toasts';

	let { data, form } = $props();
	/**
	 * `$derived`, NO una desestructuración suelta: al guardar, `enhance` vuelve
	 * a correr el `load` y `data` cambia, pero un `const` capturado una sola
	 * vez se queda con el `item` de antes —el badge de estado no se enteraba
	 * de su propio cambio. Calcado de `work-orders/[id=entero]/+page.svelte`.
	 */
	const item = $derived(data.item);

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	// El mensaje del articulo y el de almacenes/proveedores/seriales comparten
	// el objeto `form`: el `scope` decide sobre cual tarjeta se pinta. Calcado
	// de `customers/[id=entero]/+page.svelte`.
	const mensajeArticulo = $derived(!form?.scope || form.scope === 'articulo' ? form : null);
	const mensajeSeriales = $derived(form?.scope === 'seriales' ? form : null);

	$effect(() => {
		if (mensajeArticulo?.error) dangerModal.show(mensajeArticulo.error);
		if (mensajeArticulo?.success) toasts.success('Cambios guardados.');
	});
	$effect(() => {
		if (mensajeSeriales?.error) dangerModal.show(mensajeSeriales.error);
		if (mensajeSeriales?.success) toasts.success(mensajeSeriales.success);
	});

	/** `reset: false`: ver el comentario de `customers/[id=entero]/+page.svelte`. */
	const alGuardar = () => async ({ update }) => update({ reset: false });
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/settings/articles" aria-label="Volver al catálogo de artículos" title="Volver al catálogo de artículos">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar el artículo"
			title="Recargar el artículo"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>
</div>

<div class="record-layout">
	<div class="record-col">
		<section class="panel">
			<div class="ficha-titulo">
				<h2 class="panel-titulo">{item.name}</h2>
				<span class="badge {recordStateBadgeClass(item.is_active)}">
					{recordStateLabel(item.is_active)}
				</span>
			</div>

			<form method="POST" action="?/update" class="form-grid" use:enhance={alGuardar}>
				<div class="form-field">
					<label for="name">Nombre *</label>
					<input id="name" name="name" value={item.name} required />
				</div>
				<div class="form-field">
					<label for="internal_code">Código / SKU</label>
					<input id="internal_code" name="internal_code" value={item.internal_code ?? ''} />
				</div>
				<div class="form-field">
					<label for="category_id">Categoría</label>
					<select id="category_id" name="category_id">
						<option value="">Sin categoría</option>
						{#each data.categories as category (category.id)}
							<option value={category.id} selected={String(item.category_id) === String(category.id)}>
								{category.name}
							</option>
						{/each}
					</select>
				</div>
				<div class="form-field">
					<label for="item_type">Tipo de control</label>
					<select id="item_type" name="item_type">
						<option value="cantidad" selected={!data.isSerialized}>Por cantidad</option>
						<option value="serializado" selected={data.isSerialized}>Por número de serie</option>
					</select>
					<span class="form-hint">
						Serializado permite saber qué unidad concreta salió a cada evento.
					</span>
				</div>
				<div class="form-field">
					<label for="uom_id">Unidad de medida</label>
					<select id="uom_id" name="uom_id">
						<option value="">(Ninguna)</option>
						{#each data.units as unidad (unidad.id)}
							<option value={unidad.id} selected={String(item.uom_id) === String(unidad.id)}>
								{unidad.name}{unidad.abbr ? ` (${unidad.abbr})` : ''}
							</option>
						{/each}
					</select>
				</div>
				<div class="form-field">
					<label for="rental_price">Precio de alquiler</label>
					<input id="rental_price" name="rental_price" type="number" min="0" step="any" value={item.rental_price ?? 0} />
				</div>
				<div class="form-field">
					<label for="internal_cost">Precio de compra</label>
					<input id="internal_cost" name="internal_cost" type="number" min="0" step="any" value={item.internal_cost ?? 0} />
					<span class="form-hint">Se propone como costo unitario al registrar una entrada.</span>
				</div>
				<!--
					El select solo aparece con permiso de archivar, y el servidor lo
					vuelve a comprobar antes de aplicarlo: ocultarlo aquí es cortesía,
					no el control real. Calcado de `CustomerFormFields`.
				-->
				{#if data.puedeArchivar}
					<div class="form-field">
						<label for="is_active">Estado</label>
						<select id="is_active" name="is_active">
							<option value="1" selected={item.is_active === 1}>Activo</option>
							<option value="2" selected={item.is_active === 2}>Inactivo</option>
							<option value="0" selected={item.is_active === 0}>Archivado</option>
						</select>
					</div>
				{/if}
				<div class="form-field full">
					<label for="notes">Notas</label>
					<textarea id="notes" name="notes" rows="2">{item.notes ?? ''}</textarea>
				</div>
				<div class="form-actions">
					{#if can('inventory.update')}
						<button type="submit" class="btn-primary">Guardar cambios</button>
					{:else}
						<p class="panel-hint">Su rol no permite editar este registro.</p>
					{/if}
				</div>
			</form>
		</section>
	</div>

	<div class="record-col">
		<ItemWarehouseBook
			distribution={data.distribution}
			warehouses={data.warehouses}
			isSerialized={data.isSerialized}
			searchTerm={item.internal_code || item.name}
			{form}
		/>

		<ItemSupplierBook itemSuppliers={data.itemSuppliers} suppliers={data.suppliers} {form} />
	</div>
</div>

{#if data.isSerialized}
	<section class="panel">
		<h2 class="sec-title">Números de serie ({data.serials.length})</h2>
		<p class="panel-hint">
			Cada número identifica una unidad física. Al entregar se eligen las unidades concretas que
			salen; vuelven a estar disponibles al registrar la devolución.
		</p>

		{#if can('inventory.update')}
			<form method="POST" action="?/addSerials" class="form-grid" use:enhance>
				<div class="form-field full">
					<label for="serials">Agregar seriales (uno por línea)</label>
					<textarea id="serials" name="serials" rows="4" placeholder="SN-0001&#10;SN-0002"></textarea>
				</div>
				<!--
					A qué almacén entran. Es obligatorio porque una unidad física está
					en algún sitio: sin almacén no se contaba en ninguno y el artículo
					aparecía en cero en todo el inventario. Registrando dos tandas se
					reparte el mismo artículo entre varios almacenes.
				-->
				<div class="form-field">
					<label for="serials_warehouse">Almacén al que entran</label>
					<select id="serials_warehouse" name="warehouse_id" required>
						{#each data.warehouses as almacen (almacen.id)}
							<option value={String(almacen.id)}>{almacen.name}</option>
						{/each}
					</select>
				</div>
				<div class="form-actions">
					<button type="submit" class="btn-primary" disabled={data.warehouses.length === 0}>
						Agregar seriales
					</button>
				</div>
			</form>
			{#if data.warehouses.length === 0}
				<p class="panel-hint">
					No hay almacenes: cree el primero en
					<a href="/settings/warehouses">Almacenes</a> para poder registrar unidades.
				</p>
			{/if}
		{/if}

		{#if data.serials.length === 0}
			<p class="empty-state">
				Todavía no hay unidades registradas. Sin ellas el artículo no se puede entregar.
			</p>
		{:else}
			<table class="data-table">
				<thead>
					<tr>
						<th>Número de serie</th>
						<th>Estado</th>
						<th>Almacén</th>
						<th>Orden</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.serials as serial (serial.id)}
						{@const entregado = serial.status === 'entregado'}
						<tr>
							<td>{serial.serial_number}</td>
							<td>
								<span
									class="badge"
									class:badge-active={serial.status === 'disponible'}
									class:badge-warning={serial.status === 'mantenimiento'}
									class:badge-danger={entregado}
									class:badge-inactive={serial.status === 'retirado'}
								>
									{serial.status}
								</span>
							</td>
							<td>
								<!-- Editable: aquí ya no es solo lectura. Reasignar el almacén
								     de una unidad es el «trasladar» de un serializado. -->
								{#if can('inventory.update')}
									<form method="POST" action="?/moveSerial" use:enhance>
										<input type="hidden" name="serial_id" value={serial.id} />
										<select
											name="warehouse_id"
											value={String(serial.warehouse_id ?? '')}
											aria-label={`Almacén de ${serial.serial_number}`}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										>
											{#if !serial.warehouse_id}<option value="">Sin almacén</option>{/if}
											{#each data.warehouses as almacen (almacen.id)}
												<option value={String(almacen.id)}>{almacen.name}</option>
											{/each}
										</select>
									</form>
								{:else}
									{serial.warehouse_name ?? 'Sin almacén'}
								{/if}
							</td>
							<td>
								{#if entregado && serial.work_order_id}
									<a href="/work-orders/{serial.work_order_id}">#{serial.work_order_id}</a>
								{:else}
									—
								{/if}
							</td>
							<td>
								{#if can('inventory.update') && !entregado}
									<form method="POST" action="?/setSerialStatus" class="linea" use:enhance>
										<input type="hidden" name="serial_id" value={serial.id} />
										<select name="status" aria-label={`Estado de ${serial.serial_number}`}>
											<option value="disponible" selected={serial.status === 'disponible'}>
												Disponible
											</option>
											<option value="mantenimiento" selected={serial.status === 'mantenimiento'}>
												Mantenimiento
											</option>
											<option value="retirado" selected={serial.status === 'retirado'}>
												Retirado
											</option>
										</select>
										<button type="submit" class="btn-link">Guardar</button>
									</form>
								{:else if entregado}
									<span class="nota">Se libera al registrar la devolución</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
{/if}

<style>
	/* El nombre del artículo vive DENTRO del panel que describe —igual que
	   «Almacenes»/«Proveedores» titulan el suyo—, no suelto arriba de la
	   página. El borde de abajo es el único divisor entre el título y el
	   formulario: sin título de sección genérico que lo reemplace, hacía
	   falta algo que marcara dónde termina uno y empieza el otro. */
	.ficha-titulo {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: 1px solid var(--border);
	}

	.panel-titulo {
		margin: 0;
		font-size: var(--font-lg);
		font-weight: 600;
	}

	/* Calcado de `.client-layout` (ficha de Cliente): izquierda el formulario,
	   derecha los almacenes y sus proveedores. */
	.record-layout {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
		align-items: start;
	}

	.record-col {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	@media (max-width: 1100px) {
		.record-layout {
			grid-template-columns: 1fr;
		}
	}

	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
		font-weight: 600;
	}

	.linea {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.nota {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}
</style>
