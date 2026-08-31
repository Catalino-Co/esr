<script>
	import RecordStateControl from '$lib/components/list/RecordStateControl.svelte';
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const item = data.item;
</script>

<section class="panel">
	<div class="page-header">
		<h1>{item.name}</h1>
		<div class="page-actions">
			<!-- Un enlace, no datos: desde aquí se va a ver cuánto hay. -->
			<a class="btn-secondary" href="/inventory?search={encodeURIComponent(item.internal_code || item.name)}">
				Ver en Inventario
			</a>
			<a class="btn-secondary" href="/settings/articles">Volver al listado</a>
		</div>
	</div>

	<RecordStateControl
		state={item.is_active}
		editable={can('inventory.archive')}
		noun="artículo"
	/>

	{#if form?.success}
		<p class="badge badge-active">Cambios guardados.</p>
	{/if}
	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<!-- Ni tarjetas de existencias ni aviso de sobrecompromiso: esta pantalla es
	     el CATÁLOGO. Cuánto hay, cuánto está comprometido y dónde se guarda se ve
	     en Inventario, y se llega por el enlace de abajo. Repetir aquí esas cifras
	     acabaría enseñando dos números distintos para lo mismo. -->

	<form method="POST" action="?/update" class="form-grid" use:enhance>
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
			<label for="supplier_id">Proveedor</label>
			<select id="supplier_id" name="supplier_id">
				<option value="">(Ninguno)</option>
				{#each data.suppliers as proveedor (proveedor.id)}
					<option value={proveedor.id} selected={String(item.supplier_id) === String(proveedor.id)}>
						{proveedor.name}
					</option>
				{/each}
			</select>
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
		<!--
			Los dos precios VIGENTES, juntos y dichos por su nombre.

			Son valores por defecto: la cotización copia el de alquiler en su línea
			y la entrada de stock copia el de compra en el movimiento. Cambiarlos
			aquí no reescribe ninguna de las dos cosas, y esa es justamente la
			propiedad que la nota explica, porque de otro modo nadie se atrevería a
			corregir una tarifa.
		-->
		<div class="form-field full precios-titulo">
			<h2 class="sec-title">Precios vigentes</h2>
			<span class="form-hint">
				Se proponen al cotizar y al registrar una entrada. Cada documento guarda su
				propia copia, así que cambiarlos aquí no altera nada ya emitido.
			</span>
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
		<div class="form-field full">
			<label for="description">Descripción</label>
			<textarea id="description" name="description" rows="3">{item.description ?? ''}</textarea>
		</div>
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
				<div class="form-actions">
					<button type="submit" class="btn-primary">Agregar seriales</button>
				</div>
			</form>
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
	/* Separa los dos precios del resto de la ficha sin encerrarlos en otra
	   tarjeta: son campos del mismo formulario, no una seccion aparte. */
	.precios-titulo {
		margin-top: var(--sp-3);
		border-top: 1px solid var(--border);
		padding-top: var(--sp-4);
	}

	.precios-titulo .sec-title {
		margin-bottom: var(--sp-1);
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
