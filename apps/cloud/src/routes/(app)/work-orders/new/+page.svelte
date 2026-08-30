<script>
	import { formatMoney } from '@esr/core';

	let { data, form } = $props();

	/**
	 * Las líneas se editan en el navegador y viajan de golpe. La orden nace
	 * confirmada y apartando stock, así que no hay un estado intermedio en el
	 * que se le pudieran ir añadiendo artículos.
	 */
	let lineas = $state([{ item_id: '', quantity: 1, price: '' }]);

	/**
	 * La cabecera va en `$state` y enlazada con `bind:value`, no con
	 * `value={...}` suelto.
	 *
	 * Con `value={...}` cada re-render —añadir o quitar una línea, por ejemplo—
	 * vuelve a aplicar la expresión y BORRA lo que hubiera escrito el usuario.
	 * Lo hacía: se escribía la ventana de alquiler, se añadía un artículo y las
	 * fechas desaparecían sin avisar, así que la orden se creaba sin ellas y
	 * reservaba el stock para siempre en vez de para esos días.
	 */
	let cabecera = $state({
		client_id: form?.values?.client_id ?? data.clientId,
		event_id: form?.values?.event_id ?? '',
		date: form?.values?.date || data.hoy,
		responsible_person: form?.values?.responsible_person ?? '',
		start_date: form?.values?.start_date ?? '',
		end_date: form?.values?.end_date ?? '',
		vehicle: form?.values?.vehicle ?? '',
		notes: form?.values?.notes ?? ''
	});

	const porId = new Map(data.inventory.map((item) => [String(item.id), item]));

	function añadir() {
		lineas = [...lineas, { item_id: '', quantity: 1, price: '' }];
	}

	function quitar(indice) {
		lineas = lineas.filter((_, i) => i !== indice);
		if (!lineas.length) añadir();
	}

	/**
	 * Al elegir artículo se propone su tarifa (`rental_price`), y solo si el
	 * precio está vacío: si ya se escribió uno, manda el escrito.
	 */
	function alElegirArticulo(indice, itemId) {
		const item = porId.get(String(itemId));
		if (lineas[indice].price === '') lineas[indice].price = item?.rental_price ?? '';
	}

	const utiles = $derived(lineas.filter((linea) => linea.item_id));
	const total = $derived(
		utiles.reduce((suma, linea) => suma + Number(linea.quantity || 0) * Number(linea.price || 0), 0)
	);

	/** El mismo artículo dos veces reservaría dos veces contra el mismo stock. */
	const repetido = $derived(
		new Set(utiles.map((linea) => String(linea.item_id))).size !== utiles.length
	);

	/** Los eventos se acotan al cliente elegido: son suyos. */
	const eventosDelCliente = $derived(
		cabecera.client_id
			? data.events.filter((evento) => String(evento.client_id) === String(cabecera.client_id))
			: data.events
	);
</script>

<section class="panel">
	<div class="page-header">
		<div class="page-header-actions">
			<a class="btn-secondary" href="/work-orders">Volver</a>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<p class="panel-hint">
		Una orden sin cotización nace <strong>confirmada</strong> y aparta el stock de sus artículos
		desde ese momento. Si no hay disponibilidad en la ventana indicada, no se crea.
	</p>

	<form method="POST">
		<div class="form-grid">
			<div class="form-field">
				<label for="client_id">Cliente *</label>
				<select id="client_id" name="client_id" required bind:value={cabecera.client_id}>
					<option value="">Elija el cliente</option>
					{#each data.customers as customer (customer.id)}
						<option value={customer.id}>{customer.name}</option>
					{/each}
				</select>
			</div>
			<div class="form-field">
				<label for="event_id">Evento</label>
				<select id="event_id" name="event_id" bind:value={cabecera.event_id}>
					<option value="">Sin evento</option>
					{#each eventosDelCliente as evento (evento.id)}
						<option value={evento.id}>{evento.name} — {evento.date}</option>
					{/each}
				</select>
			</div>
			<div class="form-field">
				<label for="date">Fecha de la orden</label>
				<input id="date" name="date" type="date" bind:value={cabecera.date} />
			</div>
			<div class="form-field">
				<label for="responsible_person">Responsable</label>
				<input
					id="responsible_person"
					name="responsible_person"
					bind:value={cabecera.responsible_person}
				/>
			</div>
			<div class="form-field">
				<label for="start_date">Alquiler desde</label>
				<input id="start_date" name="start_date" type="date" bind:value={cabecera.start_date} />
			</div>
			<div class="form-field">
				<label for="end_date">Alquiler hasta</label>
				<input id="end_date" name="end_date" type="date" bind:value={cabecera.end_date} />
			</div>
			<div class="form-field">
				<label for="vehicle">Vehículo</label>
				<input id="vehicle" name="vehicle" bind:value={cabecera.vehicle} />
			</div>
			<div class="form-field full">
				<label for="notes">Notas</label>
				<input id="notes" name="notes" bind:value={cabecera.notes} />
			</div>
		</div>

		<div class="seccion-lineas">
			<h2 class="sec-title">Artículos</h2>
			<button type="button" class="btn-secondary btn-new" onclick={añadir}>Añadir línea</button>
		</div>

		<table class="data-table">
			<thead>
				<tr>
					<th>Artículo</th>
					<th class="col-num">Cantidad</th>
					<th class="col-num">Precio</th>
					<th class="col-num">Importe</th>
					<th class="col-accion"></th>
				</tr>
			</thead>
			<tbody>
				{#each lineas as linea, indice (indice)}
					<tr>
						<td>
							<select
								name="line_item_id"
								bind:value={linea.item_id}
								onchange={(e) => alElegirArticulo(indice, e.currentTarget.value)}
								aria-label="Artículo de la línea {indice + 1}"
							>
								<option value="">Elija el artículo</option>
								{#each data.inventory as item (item.id)}
									<option value={item.id}>
										{item.name}{item.internal_code ? ` (${item.internal_code})` : ''}
									</option>
								{/each}
							</select>
						</td>
						<td class="col-num">
							<input
								name="line_quantity"
								type="number"
								min="1"
								step="1"
								bind:value={linea.quantity}
								aria-label="Cantidad de la línea {indice + 1}"
							/>
						</td>
						<td class="col-num">
							<input
								name="line_price"
								type="number"
								min="0"
								step="0.01"
								bind:value={linea.price}
								aria-label="Precio de la línea {indice + 1}"
							/>
						</td>
						<td class="col-num importe">
							{formatMoney(Number(linea.quantity || 0) * Number(linea.price || 0))}
						</td>
						<td class="col-accion">
							<button
								type="button"
								class="btn-danger btn-sm"
								onclick={() => quitar(indice)}
								aria-label="Quitar la línea {indice + 1}"
							>
								Quitar
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="fila-total">
					<td colspan="3" class="col-num">Total</td>
					<td class="col-num">{formatMoney(total)}</td>
					<td></td>
				</tr>
			</tfoot>
		</table>

		{#if repetido}
			<div class="alert-error" role="alert">
				Hay un artículo repetido: súmelo en una sola línea.
			</div>
		{/if}

		<div class="form-actions">
			<a class="btn-secondary" href="/work-orders">Cancelar</a>
			<button type="submit" class="btn-primary" disabled={utiles.length === 0 || repetido}>
				Crear orden
			</button>
		</div>
	</form>
</section>

<style>
	.sec-title {
		margin: 0;
		font-size: var(--font-md);
	}

	.seccion-lineas {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin: var(--sp-5) 0 var(--sp-3);
	}

	.col-num {
		text-align: right;
		white-space: nowrap;
	}

	/* Los campos de una tabla no deben pedir el ancho entero: la columna manda. */
	.col-num input {
		width: 7rem;
		text-align: right;
	}

	.col-accion {
		width: 5rem;
	}

	.importe {
		font-weight: 600;
	}

	.fila-total td {
		font-weight: 700;
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
