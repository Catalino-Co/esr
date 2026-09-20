<script>
	import { formatDate, formatMoney } from '@esr/core';
	import { FormattedNumberField, Icon, SearchPicker } from '@esr/ui';
	import Modal from '$lib/components/Modal.svelte';
	import { dangerModal } from '$lib/stores/dangerModal';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
	});

	/**
	 * El origen de un borrador ya existente no cambia nunca -a diferencia de
	 * `/invoices/new`, aqui no hay selector-, pero sigue siendo `$derived` y no
	 * una desestructuración suelta: si SvelteKit reutiliza este componente al
	 * navegar entre dos borradores distintos, `data` cambia y esto tiene que
	 * seguirlo.
	 */
	const origen = $derived(data.origen);

	/**
	 * Forma de cada fila «facturable» cuando el backend afloja la consulta con
	 * `alsoClaimedByInvoiceId` (ver `+page.server.ts`): ademas de sus columnas
	 * de siempre, cada conduce/línea de servicio trae `already_claimed`
	 * (booleano) indicando si ESTE borrador ya la reclama.
	 */
	function yaReclamado(fila) {
		return Boolean(fila.already_claimed);
	}

	/**
	 * Misma idea que `yaReclamado`, pero de CANTIDAD: cuánto de esta línea de
	 * cotización reclama ya este borrador (`claimed_quantity`, numérico aunque
	 * puede llegar como cadena igual que el resto de columnas `NUMERIC` de este
	 * repositorio).
	 */
	function cantidadReclamada(fila) {
		return Number(fila.claimed_quantity ?? 0) || 0;
	}

	// ── Origen: Orden ─────────────────────────────────────────────────────────
	// A diferencia de `/invoices/new` -donde todo lo facturable nace marcado-,
	// aquí solo nace marcado lo que ESTE borrador ya reclamó; el resto de lo
	// facturable aparece disponible pero sin seleccionar.
	let elegidas = $state(new Set((data.conduces ?? []).filter(yaReclamado).map((c) => String(c.id))));
	let elegidasServicios = $state(
		new Set((data.serviciosOrden ?? []).filter(yaReclamado).map((s) => String(s.id)))
	);

	function alternar(id) {
		const clave = String(id);
		const copia = new Set(elegidas);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		elegidas = copia;
	}

	function alternarServicio(id) {
		const clave = String(id);
		const copia = new Set(elegidasServicios);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		elegidasServicios = copia;
	}

	// ── Origen: Cotización ────────────────────────────────────────────────────
	let lineasQuote = $state(
		(data.lineasCotizacion ?? []).map((l) => {
			const cantidadActual = cantidadReclamada(l);
			return {
				...l,
				on: cantidadActual > 0,
				cantidad: cantidadActual,
				// `remaining` YA cuenta lo que esta misma factura tiene reservado
				// como "libre" (por `alsoClaimedByInvoiceId` en el backend, que
				// excluye del cálculo de facturado lo que reclama ESTA factura) —
				// es directamente el tope correcto, sin sumarle nada más.
				remaining: Number(l.remaining ?? 0)
			};
		})
	);

	function alternarLineaQuote(linea) {
		linea.on = !linea.on;
		lineasQuote = [...lineasQuote];
	}

	function limitarCantidad(linea) {
		const max = Number(linea.remaining);
		let n = Number(linea.cantidad) || 0;
		if (n > max) n = max;
		if (n < 0) n = 0;
		linea.cantidad = n;
		lineasQuote = [...lineasQuote];
	}

	// ── Origen: Directa ───────────────────────────────────────────────────────
	// El cliente y las líneas actuales de la factura son su punto de partida
	// -una factura libre no tiene "facturable" del que tirar, sus líneas viven
	// solo en `invoice_items`-.
	let clienteDirecta = $state(data.customer ?? null);
	let siguienteUid = 1;
	/** `{ uid, kind: 'item'|'service'|'manual', ref_id, description, code, quantity, price }` */
	let lineas = $state(
		(data.lineasFactura ?? []).map((l) => ({
			uid: siguienteUid++,
			// Mismo orden de precedencia que `invoiceItemLabel` en
			// `@esr/reports/formatters`: servicio primero, luego artículo, y lo
			// que no es ninguno de los dos es la línea manual.
			kind: l.service_id != null ? 'service' : l.item_id != null ? 'item' : 'manual',
			ref_id: l.item_id ?? l.service_id ?? null,
			description: l.description ?? '',
			code: l.internal_code ?? null,
			quantity: Number(l.quantity) || 1,
			price: Number(l.price) || 0
		}))
	);

	let modalAbierto = $state(false);
	let modalTipo = $state(null);
	let modalBusqueda = $state('');
	let modalElegido = $state(null);
	let modalCantidad = $state(1);
	let modalPrecio = $state(0);
	let modalDescripcion = $state('');

	const TITULOS_MODAL = { item: 'Agregar artículo', service: 'Agregar servicio', manual: 'Línea manual' };

	function abrirModal(tipo) {
		modalTipo = tipo;
		modalBusqueda = '';
		modalElegido = null;
		modalCantidad = 1;
		modalPrecio = 0;
		modalDescripcion = '';
		modalAbierto = true;
	}

	function cerrarModal() {
		modalAbierto = false;
	}

	function elegirEnModal(catalogo) {
		modalElegido = catalogo;
		modalPrecio = Number(catalogo.rental_price ?? catalogo.price ?? 0);
	}

	function agregarLinea() {
		if (modalTipo === 'manual') {
			if (!modalDescripcion.trim()) return;
			lineas = [
				...lineas,
				{
					uid: siguienteUid++,
					kind: 'manual',
					ref_id: null,
					description: modalDescripcion.trim(),
					code: null,
					quantity: Number(modalCantidad) || 1,
					price: Number(modalPrecio) || 0
				}
			];
			cerrarModal();
			return;
		}

		if (!modalElegido) return;

		// Un Artículo repetido se fusiona por id, igual que en `/invoices/new`;
		// un Servicio o una línea manual NO.
		if (modalTipo === 'item') {
			const existente = lineas.find((l) => l.kind === 'item' && l.ref_id === modalElegido.id);
			if (existente) {
				const cantidadNueva = Number(modalCantidad) || 1;
				lineas = lineas.map((l) =>
					l === existente ? { ...l, quantity: Number(l.quantity) + cantidadNueva } : l
				);
				cerrarModal();
				return;
			}
		}

		lineas = [
			...lineas,
			{
				uid: siguienteUid++,
				kind: modalTipo,
				ref_id: modalElegido.id,
				description: modalElegido.name,
				code: modalElegido.internal_code ?? null,
				quantity: Number(modalCantidad) || 1,
				price: Number(modalPrecio) || 0
			}
		];
		cerrarModal();
	}

	function quitarLinea(uid) {
		lineas = lineas.filter((l) => l.uid !== uid);
	}

	const catalogoModal = $derived(modalTipo === 'item' ? data.items : modalTipo === 'service' ? data.services : []);

	// ── Pie común ─────────────────────────────────────────────────────────────
	// A diferencia de `/invoices/new`, el valor de partida es el de la factura
	// YA guardada, no "hoy"/vacío.
	let fecha = $state(form?.values?.date || data.invoice.date || data.hoy);
	let descuento = $state(form?.values?.discount ?? data.invoice.discount ?? '');
	let impuesto = $state(form?.values?.tax_amount ?? data.invoice.tax_amount ?? '');
	let notas = $state(form?.values?.notes ?? data.invoice.notes ?? '');

	const subtotal = $derived(
		origen === 'orden'
			? (data.conduces ?? []).filter((c) => elegidas.has(String(c.id))).reduce((s, c) => s + Number(c.total ?? 0), 0) +
					(data.serviciosOrden ?? [])
						.filter((s) => elegidasServicios.has(String(s.id)))
						.reduce((s, x) => s + Number(x.quantity || 0) * Number(x.price || 0), 0)
			: origen === 'cotizacion'
				? lineasQuote.filter((l) => l.on).reduce((s, l) => s + Number(l.cantidad || 0) * Number(l.price || 0), 0)
				: lineas.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.price || 0), 0)
	);
	const rebaja = $derived(Math.max(0, Number(descuento) || 0));
	const impuestoNum = $derived(Math.max(0, Number(impuesto) || 0));
	const total = $derived(Math.max(0, subtotal - rebaja + impuestoNum));
	const excede = $derived(rebaja > subtotal);
	const nElegidas = $derived(
		origen === 'orden'
			? elegidas.size + elegidasServicios.size
			: origen === 'cotizacion'
				? lineasQuote.filter((l) => l.on && Number(l.cantidad) > 0).length
				: lineas.length
	);
	const puedeGuardar = $derived(
		!excede &&
			((origen === 'orden' && !!data.order && nElegidas > 0) ||
				(origen === 'cotizacion' && !!data.quote && nElegidas > 0) ||
				(origen === 'directa' && !!clienteDirecta && nElegidas > 0))
	);
</script>

<div class="herramientas">
	<div class="titulo">
		<h1>Editar factura {data.invoice.invoice_number}</h1>
	</div>
	<div class="herramientas-datos">
		<div class="grupo">
			<a
				class="grupo-btn"
				href="/invoices/{data.invoice.id}"
				aria-label="Volver a la factura"
				title="Volver a la factura"
			>
				<Icon name="back" size={18} />
			</a>
		</div>
	</div>
</div>

<form method="POST" action="?/updateDraft">
	<div class="detail-layout">
		<div class="detail-main">
			{#if origen === 'orden'}
				<input type="hidden" name="work_order_id" value={data.order.id} />
				{#if data.conduces.length === 0 && data.serviciosOrden.length === 0}
					<section class="panel">
						<p class="empty-state">
							La orden {data.order.order_number || `#${data.order.id}`} no tiene nada pendiente de facturar.
						</p>
					</section>
				{:else}
					{#if data.conduces.length > 0}
						<section class="panel">
							<h2 class="titulo-seccion">Entregas de {data.order.order_number || `#${data.order.id}`}</h2>
							<ul class="pick-list">
								{#each data.conduces as conduce (conduce.id)}
									{@const marcada = elegidas.has(String(conduce.id))}
									<li>
										<label class="pick-item" class:pick-item--on={marcada}>
											<input
												type="checkbox"
												name="conduce_ids"
												value={conduce.id}
												checked={marcada}
												onchange={() => alternar(conduce.id)}
												aria-label="Incluir {conduce.note_number}"
											/>
											<span class="pick-item-cuerpo">
												<span class="pick-item-titulo">{conduce.note_number}</span>
												<span class="pick-item-meta">{formatDate(conduce.date)} · {conduce.lineas} línea(s)</span>
											</span>
											<span class="pick-item-importe">{formatMoney(conduce.total)}</span>
										</label>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
					{#if data.serviciosOrden.length > 0}
						<section class="panel">
							<h2 class="titulo-seccion">Servicios pendientes de facturar</h2>
							<ul class="pick-list">
								{#each data.serviciosOrden as servicio (servicio.id)}
									{@const marcada = elegidasServicios.has(String(servicio.id))}
									<li>
										<label class="pick-item" class:pick-item--on={marcada}>
											<input
												type="checkbox"
												name="service_line_ids"
												value={servicio.id}
												checked={marcada}
												onchange={() => alternarServicio(servicio.id)}
												aria-label="Incluir {servicio.name}"
											/>
											<span class="pick-item-cuerpo">
												<span class="pick-item-titulo">{servicio.name}</span>
												<span class="pick-item-meta">Cantidad {servicio.quantity} · {formatMoney(servicio.price)} c/u</span>
											</span>
											<span class="pick-item-importe">
												{formatMoney(Number(servicio.quantity) * Number(servicio.price))}
											</span>
										</label>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				{/if}
			{:else if origen === 'cotizacion'}
				<input type="hidden" name="quotation_id" value={data.quote.id} />
				<section class="panel">
					<h2 class="titulo-seccion">
						Líneas pendientes de {data.quote.quote_number || `#${data.quote.id}`}
					</h2>
					<p class="panel-hint">
						Se puede facturar una parte ahora y el resto más adelante; la cotización sigue
						convertible a orden por lo que quede.
					</p>
					{#if lineasQuote.length === 0}
						<p class="empty-state">Esta cotización no tiene nada pendiente de facturar.</p>
					{:else}
						<ul class="pick-list">
							{#each lineasQuote as linea (linea.id)}
								<li>
									<label class="pick-item" class:pick-item--on={linea.on}>
										<input
											type="checkbox"
											checked={linea.on}
											onchange={() => alternarLineaQuote(linea)}
											aria-label="Incluir {linea.name}"
										/>
										<span class="pick-item-cuerpo">
											<span class="pick-item-titulo">{linea.name}</span>
											<span class="pick-item-meta">
												Pendiente {linea.remaining} de {linea.quantity} · {formatMoney(linea.price)} c/u
											</span>
										</span>
										<span class="pick-item-control">
											<input
												type="number"
												class="cantidad-mini"
												min="0"
												max={linea.remaining}
												step="1"
												bind:value={linea.cantidad}
												oninput={() => limitarCantidad(linea)}
												disabled={!linea.on}
												aria-label="Cantidad a facturar de {linea.name}"
											/>
										</span>
										<span class="pick-item-importe">{formatMoney(Number(linea.cantidad || 0) * Number(linea.price))}</span>
										{#if linea.on && Number(linea.cantidad) > 0}
											<input type="hidden" name="qi_id" value={linea.id} />
											<input type="hidden" name="qi_quantity" value={linea.cantidad} />
										{/if}
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{:else if origen === 'directa'}
				<section class="panel">
					<SearchPicker
						label="Cliente"
						icon="user"
						required
						name="client_id"
						placeholder="Buscar cliente por nombre…"
						items={data.clients}
						bind:value={clienteDirecta}
						getMain={(c) => c.name}
						getSub={(c) => [c.document_id, c.phone].filter(Boolean).join(' · ')}
					/>
				</section>

				<section class="panel">
					<div class="page-header" style="margin-bottom:12px;">
						<h2 class="titulo-seccion" style="margin:0;">Líneas de la factura</h2>
						<span class="cuenta">{lineas.length}</span>
					</div>

					<div class="agregar-tipos" role="group" aria-label="Agregar una línea">
						<button type="button" class="tipo-btn" onclick={() => abrirModal('service')}>
							<Icon name="stock" size={18} />Servicio
						</button>
						<button type="button" class="tipo-btn" onclick={() => abrirModal('item')}>
							<Icon name="stock" size={18} />Artículo
						</button>
						<button type="button" class="tipo-btn" onclick={() => abrirModal('manual')}>
							<Icon name="penLine" size={18} />Línea manual
						</button>
					</div>

					{#if lineas.length === 0}
						<p class="empty-state">Agregue un servicio, un artículo del inventario o un cargo libre.</p>
					{:else}
						<ul class="pick-list">
							{#each lineas as linea (linea.uid)}
								<li>
									<div class="pick-item linea-card">
										<span class="pick-item-cuerpo">
											<span class="pick-item-titulo">
												{linea.description}
												{#if linea.code}<span class="linea-card-tag">({linea.code})</span>{/if}
											</span>
											<span class="pick-item-meta">
												{linea.kind === 'service' ? 'Servicio' : linea.kind === 'item' ? 'Artículo' : 'Manual'}
												· {linea.quantity} × {formatMoney(linea.price)}
											</span>
										</span>
										<span class="pick-item-importe">{formatMoney(Number(linea.quantity) * Number(linea.price))}</span>
										<button
											type="button"
											class="btn-icono"
											onclick={() => quitarLinea(linea.uid)}
											aria-label="Quitar línea"
										>
											<Icon name="trash" size={16} />
										</button>
									</div>
									<input type="hidden" name="line_kind" value={linea.kind} />
									<input type="hidden" name="line_ref_id" value={linea.ref_id ?? ''} />
									<input type="hidden" name="line_description" value={linea.description ?? ''} />
									<input type="hidden" name="line_quantity" value={linea.quantity} />
									<input type="hidden" name="line_price" value={linea.price} />
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		</div>

		<aside class="detail-side">
			<section class="panel">
				<div class="form-grid">
					<div class="form-field">
						<label for="date">Fecha</label>
						<input id="date" name="date" type="date" bind:value={fecha} />
					</div>
					<div class="form-field">
						<label for="discount">Descuento</label>
						<FormattedNumberField id="discount" name="discount" min={0} bind:value={descuento} />
					</div>
					<div class="form-field">
						<label for="tax_amount">ITBIS</label>
						<FormattedNumberField id="tax_amount" name="tax_amount" min={0} bind:value={impuesto} />
					</div>
					<div class="form-field full">
						<label for="notes">Notas</label>
						<input id="notes" name="notes" bind:value={notas} />
					</div>
				</div>
			</section>

			<section class="panel">
				<div class="totals">
					<div class="total-row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
					<div class="total-row"><span>Descuento</span><span>−{formatMoney(rebaja)}</span></div>
					<div class="total-row"><span>ITBIS</span><span>{formatMoney(impuestoNum)}</span></div>
					<div class="total-row total-row--final"><span>Total</span><span>{formatMoney(total)}</span></div>
				</div>

				{#if excede}
					<div class="alert-error" role="alert" style="margin-top:12px;">
						El descuento no puede superar el subtotal.
					</div>
				{/if}

				<div class="form-actions" style="margin-top:16px;">
					<a class="btn-secondary" href="/invoices/{data.invoice.id}">Cancelar</a>
					<button type="submit" class="btn-primary" disabled={!puedeGuardar}>Guardar cambios</button>
				</div>
			</section>
		</aside>
	</div>

	<div class="barra-movil">
		<span class="barra-movil-total">{formatMoney(total)}</span>
		<button type="submit" class="btn-primary" disabled={!puedeGuardar}>Guardar cambios</button>
	</div>
</form>

<Modal
	bind:open={modalAbierto}
	title={modalTipo ? TITULOS_MODAL[modalTipo] : ''}
	size="sm"
	hojaMovil
	onclose={cerrarModal}
>
	{#if modalTipo === 'manual'}
		<div class="form-grid">
			<div class="form-field full">
				<label for="modal-desc">Descripción *</label>
				<input id="modal-desc" maxlength="120" bind:value={modalDescripcion} placeholder="Recargo por transporte" />
			</div>
			<div class="form-field">
				<label for="modal-cant">Cantidad</label>
				<input id="modal-cant" type="number" min="1" step="1" bind:value={modalCantidad} />
			</div>
			<div class="form-field">
				<label for="modal-precio">Precio unitario</label>
				<FormattedNumberField id="modal-precio" min={0} bind:value={modalPrecio} />
			</div>
		</div>
	{:else if modalTipo}
		<div class="buscador-wrap">
			<input
				class="buscador"
				type="search"
				bind:value={modalBusqueda}
				placeholder={modalTipo === 'item' ? 'Buscar artículo…' : 'Buscar servicio…'}
			/>
		</div>
		<ul class="catalog-list">
			{#each catalogoModal.filter((c) => !modalBusqueda.trim() || c.name.toLowerCase().includes(modalBusqueda.toLowerCase())) as opcion (opcion.id)}
				<li>
					<button
						type="button"
						class="catalog-item"
						class:catalog-item--added={modalElegido?.id === opcion.id}
						onclick={() => elegirEnModal(opcion)}
					>
						<span>{opcion.name}</span>
						<span class="catalog-item-meta">
							{#if opcion.internal_code}<span>{opcion.internal_code}</span>{/if}
							<span>{formatMoney(opcion.rental_price ?? opcion.price)}</span>
						</span>
					</button>
				</li>
			{:else}
				<li class="empty-state">Sin resultados.</li>
			{/each}
		</ul>

		{#if modalElegido}
			<div class="form-grid" style="margin-top:12px;">
				<div class="form-field">
					<label for="modal-cant">Cantidad</label>
					<input id="modal-cant" type="number" min="1" step="1" bind:value={modalCantidad} />
				</div>
				<div class="form-field">
					<label for="modal-precio">Precio unitario</label>
					<FormattedNumberField id="modal-precio" min={0} bind:value={modalPrecio} />
				</div>
			</div>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarModal}><Icon name="x" size={16} />Cancelar</button>
		<button
			type="button"
			class="btn-primary"
			onclick={agregarLinea}
			disabled={modalTipo === 'manual' ? !modalDescripcion.trim() : !modalElegido}
		>
			<Icon name="check" size={16} />Agregar
		</button>
	{/snippet}
</Modal>

<style>
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

	.titulo-seccion {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
	}

	.cuenta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		padding: 0 var(--sp-2);
		border-radius: var(--radius-pill);
		background: var(--accent-subtle);
		color: var(--accent-active);
		font-size: var(--font-xs);
		font-weight: 700;
	}

	.cantidad-mini {
		width: 4.5rem;
		padding: var(--sp-1) var(--sp-2);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
		color: var(--text-primary);
		text-align: center;
		font: inherit;
	}

	.agregar-tipos {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
	}

	.tipo-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		min-height: 44px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--border-radius);
		background: var(--bg-surface);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--font-sm);
		cursor: pointer;
	}

	.tipo-btn:hover {
		border-style: solid;
		border-color: var(--accent-border);
		background: var(--accent-subtle);
	}

	/* `.pick-item` por defecto espera casilla+cuerpo+importe (3 columnas
	   auto/1fr/auto); una línea libre no lleva casilla, lleva un botón de
	   quitar en su lugar -mismo número de columnas, orden distinto-. */
	.linea-card {
		grid-template-columns: minmax(0, 1fr) auto auto;
		cursor: default;
	}

	.linea-card-tag {
		font-weight: 400;
		color: var(--text-secondary);
	}

	.btn-icono {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--border-radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.btn-icono:hover {
		background: var(--bg-hover);
		color: var(--danger-text);
	}

	.buscador-wrap {
		margin-bottom: var(--sp-3);
	}

	.buscador {
		width: 100%;
		font-family: inherit;
		font-size: var(--font-sm);
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
		color: var(--text-primary);
	}

	.buscador:focus {
		outline: none;
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	.barra-movil {
		display: none;
	}

	@media (max-width: 900px) {
		.agregar-tipos {
			grid-template-columns: minmax(0, 1fr);
		}

		.barra-movil {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--sp-3);
			position: sticky;
			bottom: 0;
			z-index: 20;
			margin-top: var(--sp-4);
			padding: var(--sp-3) var(--content-padding);
			background: var(--bg-surface);
			border-top: 1px solid var(--border);
			box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.08);
		}

		.barra-movil-total {
			font-size: var(--font-lg);
			font-weight: 700;
		}

		.barra-movil .btn-primary {
			flex: 1;
			justify-content: center;
		}

		.detail-side .form-actions {
			display: none;
		}
	}
</style>
