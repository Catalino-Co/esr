<script>
	import { Icon } from '@esr/ui';
	import { formatMoney, mergeRentalOrderItem } from '@esr/core';

	let { data, form } = $props();

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

	const porId = new Map(data.catalogo.map((item) => [String(item.id), item]));

	/**
	 * Las líneas sobreviven a un error del servidor.
	 *
	 * El fallo más frecuente de esta pantalla es que falte disponibilidad de un
	 * artículo, y hasta ahora eso vaciaba la orden entera: había que volver a
	 * montarla desde el catálogo para corregir una sola línea. Ahora la acción
	 * las devuelve en `values` y aquí se rehidratan; el nombre y el código se
	 * recuperan del catálogo, que ya viene cargado.
	 *
	 * Esto funciona porque el formulario NO lleva `use:enhance`: un fallo es una
	 * respuesta completa, el componente se monta de nuevo y este inicializador
	 * vuelve a correr con `form` ya puesto.
	 */
	let lineas = $state(
		(form?.values?.lines ?? []).map(
			(/** @type {{ item_id: string, quantity: string, price: string }} */ linea) => {
				const item = porId.get(String(linea.item_id));
				return {
					item_id: String(linea.item_id),
					name: item?.name ?? 'Artículo',
					internal_code: item?.internal_code ?? '',
					disponible: item?.available_quantity ?? 0,
					quantity: Number(linea.quantity) || 1,
					price: linea.price
				};
			}
		)
	);

	/* ── El catálogo ────────────────────────────────────────────────────── */
	let busqueda = $state('');
	/** Cuánto añade el botón «+» de cada fila. Uno por artículo. */
	let aAgregar = $state(/** @type {Record<string, number>} */ ({}));

	const termino = $derived(busqueda.trim().toLowerCase());
	const visibles = $derived(
		data.catalogo.filter((item) => {
			if (!termino) return true;
			return [item.name, item.internal_code, item.categoria].some((valor) =>
				(valor ?? '').toLowerCase().includes(termino)
			);
		})
	);

	const yaEnLaOrden = $derived(new Set(lineas.map((linea) => String(linea.item_id))));

	/**
	 * Añade el artículo, o SUMA su cantidad si ya estaba.
	 *
	 * Es lo que hace desaparecer el aviso de «artículo repetido» que tenía esta
	 * pantalla: con un `<select>` por línea se podía elegir el mismo dos veces y
	 * reservar dos veces contra el mismo stock, y lo único que quedaba era
	 * detectarlo y bloquear el envío. Desde el catálogo no hay forma de duplicar.
	 *
	 * @param {typeof data.catalogo[number]} item
	 */
	function añadir(item) {
		const cantidad = Number(aAgregar[String(item.id)]) || 1;
		lineas = mergeRentalOrderItem(lineas, {
			item_id: String(item.id),
			name: item.name,
			internal_code: item.internal_code,
			disponible: item.available_quantity,
			quantity: cantidad,
			// La tarifa del artículo es una PROPUESTA que la línea copia. Cambiarla
			// aquí no toca el catálogo, y cambiar el catálogo mañana no recalcula
			// esta orden: es el mismo trato que tienen las líneas de cotización.
			price: String(item.rental_price ?? '')
		});
		aAgregar = { ...aAgregar, [String(item.id)]: 1 };
	}

	/** @param {number} indice */
	function quitar(indice) {
		lineas = lineas.filter((_, i) => i !== indice);
	}

	const total = $derived(
		lineas.reduce((suma, linea) => suma + Number(linea.quantity || 0) * Number(linea.price || 0), 0)
	);

	/* Lo que el servidor va a rechazar, dicho antes de enviarlo. La comprobación
	   firme la hace `createDirect` contra la ventana de alquiler; esta es la de
	   cortesía, y por eso avisa sin bloquear el botón. */
	const sinStock = $derived(
		lineas.filter((linea) => Number(linea.quantity || 0) > Number(linea.disponible ?? 0))
	);

	const puedeCrear = $derived(Boolean(cabecera.client_id) && lineas.length > 0);
</script>

<!-- La misma cabecera que la ficha: título y total a la izquierda, la acción
     principal y el grupo de iconos a la derecha. El botón de crear vive fuera
     del `<form>` y lo envía con `form="orden-nueva"`, como el diálogo de alta
     de cotizaciones. -->
<div class="herramientas">
	<div class="titulo">
		<h1>Nueva orden</h1>
		<span class="total">{formatMoney(total)}</span>
	</div>

	<div class="herramientas-datos">
		<button type="submit" form="orden-nueva" class="btn-primary" disabled={!puedeCrear}>
			Crear orden
		</button>
		<div class="grupo">
			<a class="grupo-btn" href="/work-orders" aria-label="Volver a órdenes" title="Volver a órdenes">
				<Icon name="back" size={18} />
			</a>
		</div>
	</div>
</div>

{#if form?.error}
	<div class="alert-error" role="alert">{form.error}</div>
{/if}

<form id="orden-nueva" method="POST" class="panel">
	<p class="panel-hint">
		Una orden sin cotización nace <strong>confirmada</strong> y aparta el stock de sus artículos desde
		ese momento. Si viene de una cotización aprobada, conviértala desde su ficha: así las dos quedan
		enlazadas.
	</p>

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
			<label for="event_id">Evento vinculado</label>
			<select id="event_id" name="event_id" bind:value={cabecera.event_id}>
				<option value="">Sin evento</option>
				{#each data.events.filter((evento) => !cabecera.client_id || String(evento.client_id) === String(cabecera.client_id)) as evento (evento.id)}
					<option value={evento.id}>{evento.name} — {evento.date}</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="date">Fecha de operación</label>
			<input id="date" name="date" type="date" bind:value={cabecera.date} />
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
			<label for="responsible_person">Responsable / chofer</label>
			<input
				id="responsible_person"
				name="responsible_person"
				bind:value={cabecera.responsible_person}
			/>
		</div>
		<div class="form-field">
			<label for="vehicle">Vehículo asignado</label>
			<input id="vehicle" name="vehicle" bind:value={cabecera.vehicle} />
		</div>
	</div>
</form>

<!-- Dos columnas, como el editor de ESR Pro, y con el reparto que se corrigió
     allí en la fase 4: el catálogo acotado y la tabla de equipos elástica. El
     inventario es de donde se ELIGE; los equipos son lo que se TRABAJA. -->
<div class="editor-layout">
	<section class="panel catalogo">
		<div class="cabecera-tarjeta">
			<h2 class="titulo-seccion">📦 Inventario disponible</h2>
			<span class="cuenta">{visibles.length}</span>
		</div>

		<!-- Fuera del `<form>` y SIN `name`: es un filtro de pantalla, no un campo
		     de la orden. Así tampoco envía el formulario al pulsar Intro. -->
		<input
			class="buscador"
			type="search"
			placeholder="Nombre, código o categoría"
			bind:value={busqueda}
			aria-label="Buscar en el inventario"
		/>

		<div class="catalogo-tabla">
			<table class="data-table">
				<thead>
					<tr>
						<th>Artículo</th>
						<th class="num">Libre</th>
						<th class="col-agregar"></th>
					</tr>
				</thead>
				<tbody>
					{#each visibles as item (item.id)}
						<tr class:elegido={yaEnLaOrden.has(String(item.id))}>
							<td>
								<span class="articulo">{item.name}</span>
								<small class="meta">
									{item.internal_code || 'Sin código'}{item.categoria ? ` · ${item.categoria}` : ''}
								</small>
							</td>
							<td class="num" class:agotado={item.available_quantity <= 0}>
								{item.available_quantity}
							</td>
							<td class="col-agregar">
								<div class="agregar">
									<input
										type="number"
										min="1"
										step="1"
										class="cantidad-mini"
										value={aAgregar[String(item.id)] ?? 1}
										oninput={(e) =>
											(aAgregar = { ...aAgregar, [String(item.id)]: Number(e.currentTarget.value) })}
										aria-label="Cantidad de {item.name}"
									/>
									<button
										type="button"
										class="btn-secondary btn-sm"
										onclick={() => añadir(item)}
										aria-label="Añadir {item.name} a la orden"
									>
										+
									</button>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="3">
								<p class="empty-state">
									{termino ? `Sin resultados para «${termino}».` : 'No hay artículos activos.'}
								</p>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<div class="columna">
		<section class="panel">
			<div class="cabecera-tarjeta">
				<h2 class="titulo-seccion">🔧 Equipos de la orden</h2>
				<span class="cuenta">{lineas.length}</span>
			</div>

			{#if lineas.length === 0}
				<p class="empty-state">Añada equipos desde el inventario de la izquierda.</p>
			{:else}
				<!-- La tabla scrollea DENTRO de su caja: con cinco columnas no cabe en
				     un telefono, y sin esto el panel la recortaba y el boton de quitar
				     quedaba fuera de alcance. -->
				<div class="tabla-scroll">
				<table class="data-table">
					<thead>
						<tr>
							<th>Equipo</th>
							<th class="num">Cantidad</th>
							<th class="num">Precio</th>
							<th class="num">Importe</th>
							<th class="col-accion"></th>
						</tr>
					</thead>
					<tbody>
						{#each lineas as linea, indice (linea.item_id)}
							<tr>
								<td>
									<!-- El id viaja oculto: en la tabla ya no hay un `<select>` de
									     artículo, se elige en el catálogo. -->
									<input type="hidden" name="line_item_id" form="orden-nueva" value={linea.item_id} />
									<span class="articulo">{linea.name}</span>
									<small class="meta">{linea.internal_code || 'Sin código'}</small>
								</td>
								<td class="num">
									<input
										name="line_quantity"
										form="orden-nueva"
										type="number"
										min="1"
										step="1"
										bind:value={linea.quantity}
										class:excedido={Number(linea.quantity || 0) > Number(linea.disponible ?? 0)}
										aria-label="Cantidad de {linea.name}"
									/>
								</td>
								<td class="num">
									<input
										name="line_price"
										form="orden-nueva"
										type="number"
										min="0"
										step="0.01"
										bind:value={linea.price}
										aria-label="Precio de {linea.name}"
									/>
								</td>
								<td class="num importe">
									{formatMoney(Number(linea.quantity || 0) * Number(linea.price || 0))}
								</td>
								<td class="col-accion">
									<button
										type="button"
										class="btn-icono"
										onclick={() => quitar(indice)}
										aria-label="Quitar {linea.name} de la orden"
										title="Quitar de la orden"
									>
										<Icon name="trash" size={16} />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="3" class="num">Total</td>
							<td class="num importe">{formatMoney(total)}</td>
							<td></td>
						</tr>
					</tfoot>
				</table>
				</div>

				{#if sinStock.length > 0}
					<p class="aviso" role="status">
						No hay existencias libres suficientes de {sinStock.map((l) => l.name).join(', ')}. La
						comprobación firme la hace el servidor contra la ventana de alquiler.
					</p>
				{/if}
			{/if}
		</section>

		<section class="panel">
			<h2 class="titulo-seccion">📝 Instrucciones de montaje / observaciones</h2>
			<textarea
				class="notas"
				name="notes"
				form="orden-nueva"
				rows="5"
				placeholder="Instrucciones de montaje, indicaciones al equipo de logística…"
				bind:value={cabecera.notes}
			></textarea>
		</section>
	</div>
</div>

<style>
	/* La cabecera reutiliza `.herramientas` de theme.css, igual que la ficha. */
	.titulo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
	}

	.titulo h1 {
		margin: 0;
		font-size: var(--font-xl);
	}

	.total {
		font-size: var(--font-lg);
		font-weight: 600;
	}

	/* Mitad y mitad, el mismo reparto que el editor de ESR Pro: las dos
	   columnas se leen, así que ninguna acota a la otra. `minmax(0, 1fr)` y no
	   `1fr` pelado, o una tabla ancha reventaría su mitad en vez de scrollear
	   dentro de su caja. */
	.editor-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: start;
		margin-top: var(--sp-4);
	}

	.columna {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-width: 0;
	}

	@media (max-width: 1100px) {
		.editor-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.cabecera-tarjeta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.titulo-seccion {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		font-weight: 600;
	}

	.cuenta {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.buscador {
		width: 100%;
		margin-bottom: var(--sp-3);
	}

	/* Los campos SUELTOS —el buscador, las notas y los de la tabla— no viven en
	   `.form-grid`, que es de donde theme.css cuelga el estilo de campo. Sin
	   esto se quedan con el de fabrica del navegador: en el tema oscuro salen
	   blancos con letra negra en medio de un panel oscuro. */
	.buscador,
	.notas,
	.data-table input {
		font-family: inherit;
		font-size: var(--font-sm);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
		color: var(--text-primary);
	}

	.buscador,
	.notas {
		padding: var(--sp-2) var(--sp-3);
	}

	/* Los de la tabla, mas apretados: la fila manda. */
	.data-table input {
		padding: var(--sp-1) var(--sp-2);
	}

	.buscador:focus,
	.notas:focus,
	.data-table input:focus {
		outline: none;
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	.notas {
		width: 100%;
	}

	/* El catálogo scrollea POR DENTRO: con trescientos artículos la página se
	   iría metros abajo y la tabla de equipos quedaría fuera de la vista. */
	.catalogo-tabla {
		max-height: 30rem;
		overflow-y: auto;
		overflow-x: auto;
	}

	.tabla-scroll {
		overflow-x: auto;
	}

	.articulo {
		display: block;
	}

	.meta {
		color: var(--text-secondary);
		font-size: var(--font-xs);
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.importe {
		font-weight: 600;
	}

	/* Los campos de una tabla no deben pedir el ancho entero: la columna manda. */
	.num input {
		width: 6.5rem;
		text-align: right;
	}

	.cantidad-mini {
		width: 3.5rem;
		text-align: center;
	}

	.agregar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-1);
	}

	.col-agregar {
		width: 7rem;
		text-align: right;
	}

	.col-accion {
		width: 2.5rem;
	}

	/* El artículo que ya está en la orden, marcado con un filete: sin esto hay
	   que mirar la otra tabla para saber si ya se añadió. */
	.elegido td:first-child {
		box-shadow: inset 3px 0 0 var(--accent);
	}

	.agotado {
		color: var(--danger-text);
		font-weight: 600;
	}

	/* Por encima del borde comun de arriba, que es igual de especifico. */
	.data-table input.excedido {
		border-color: var(--danger-text);
	}

	.aviso {
		margin: var(--sp-3) 0 0;
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.btn-icono {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.btn-icono:hover {
		background: var(--danger-bg);
		color: var(--danger-text);
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
