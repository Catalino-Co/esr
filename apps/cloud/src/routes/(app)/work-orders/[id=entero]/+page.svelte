<script>
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Icon, PdfPreviewModal } from '@esr/ui';
	import { formatDate, formatMoney, statusBadgeClass, statusLabel } from '@esr/core';

	let { data, form } = $props();
	/**
	 * `$derived`, NO una desestructuración suelta.
	 *
	 * `const { x } = data` se evalúa UNA vez al montar. Al navegar entre dos
	 * registros de la misma ruta, SvelteKit reutiliza el componente y solo
	 * cambia `data`: la pantalla se quedaba enseñando el registro anterior con
	 * la URL del nuevo.
	 */
	const order = $derived(data.order);
	const items = $derived(data.items);
	const status = $derived(order.status);
	const isReadOnly = $derived(status === 'cancelado' || status === 'cerrado');

	/* ── Imprimir ──────────────────────────────────────────────────────────
	 * Mismo patrón que la cotización y el evento: el servidor manda los datos Y
	 * registra `document.printed`, y el PDF se arma en cliente con jsPDF.
	 */
	let verPdf = $state(false);
	let pdfUrl = $state('');
	let pdfNombre = $state('orden.pdf');
	let errorPdf = $state('');
	let generando = $state(false);

	async function imprimir() {
		if (generando) return;
		generando = true;
		pdfUrl = '';
		errorPdf = '';
		verPdf = true;
		try {
			const res = await fetch(`${page.url.pathname}/document`, { method: 'POST' });
			if (!res.ok) throw new Error('El servidor rechazó la petición.');
			const { company, order: fila, items: lineas } = await res.json();
			/* Import DINÁMICO: jsPDF pesa ~400 KB, y en SSR un import de nivel
			   superior se evalúa también en el servidor, donde `Blob` y
			   `URL.createObjectURL` no existen. */
			const { generateWorkOrderPDF } = await import('@esr/reports/rentals');
			const { url, filename } = generateWorkOrderPDF(fila, lineas, 'preview', company);
			pdfUrl = url;
			pdfNombre = filename;
		} catch (/** @type {any} */ e) {
			verPdf = false;
			errorPdf = `No se pudo generar el documento. ${e?.message ?? ''}`.trim();
		} finally {
			generando = false;
		}
	}

	/**
	 * Confirmación tras entregar o devolver.
	 *
	 * `delivery` y `return` redirigen con `?delivered=` / `?returned=` desde
	 * siempre, y hasta ahora **no los leía nadie**: se registraba la entrega y la
	 * pantalla volvía sin decir ni que había pasado.
	 */
	const entregado = $derived(page.url.searchParams.get('delivered'));
	const devuelto = $derived(page.url.searchParams.get('returned'));
	const incidencias = $derived(Number(page.url.searchParams.get('incidents') || 0));
</script>

<!--
	La cabecera manda: número, estado y total a la izquierda; a la derecha UNA
	acción principal —la que toca según el estado— y las auxiliares en un grupo
	de iconos. Antes la cabecera solo llevaba Imprimir y Volver, y Preparar,
	Entregar, Cerrar y Checklists vivían en un bloque suelto DEBAJO de cuatro
	tarjetas de métrica: la acción principal de la pantalla quedaba hundida.
-->
<div class="herramientas">
	<div class="titulo">
		<h1>Orden {order.order_number || `#${order.id}`}</h1>
		<span class="badge {statusBadgeClass(status)}">{statusLabel(status)}</span>
		<span class="total">{formatMoney(order.total)}</span>
	</div>

	<div class="herramientas-datos">
		{#if !isReadOnly}
			{#if status === 'confirmado'}
				{#if can('work_orders.prepare')}
					<form method="POST" action="?/prepare" use:enhance>
						<button type="submit" class="btn-primary">Preparar orden</button>
					</form>
				{/if}
				{#if can('operations.deliver')}
					<a class="btn-secondary" href="/work-orders/{order.id}/delivery">Registrar entrega</a>
				{/if}
			{:else if status === 'en_preparacion'}
				{#if can('operations.deliver')}
					<a class="btn-primary" href="/work-orders/{order.id}/delivery">Registrar entrega</a>
				{/if}
			{:else if status === 'entregado' || status === 'parcialmente_devuelto'}
				{#if can('operations.return')}
					<a class="btn-primary" href="/work-orders/{order.id}/return">Registrar devolución</a>
				{/if}
				{#if can('incidents.create')}
					<a class="btn-secondary" href="/work-orders/{order.id}/incidents">Registrar incidencia</a>
				{/if}
			{:else if status === 'devuelto'}
				{#if can('work_orders.close')}
					<form method="POST" action="?/close" use:enhance>
						<button type="submit" class="btn-primary">Cerrar orden</button>
					</form>
				{/if}
			{/if}
		{/if}

		<div class="grupo">
			<a class="grupo-btn" href="/work-orders" aria-label="Volver a órdenes" title="Volver a órdenes">
				<Icon name="back" size={18} />
			</a>
			<button
				type="button"
				class="grupo-btn"
				onclick={imprimir}
				disabled={generando}
				aria-label="Imprimir la orden"
				title="Imprimir la orden"
			>
				<Icon name="printer" size={18} />
			</button>
			<!-- Checklists SIEMPRE, también con la orden cerrada. Antes vivía dentro
			     del bloque que se ocultaba al cerrar, o sea que desaparecía justo
			     cuando más se consulta: para comprobar qué volvió. -->
			<a
				class="grupo-btn"
				href="/work-orders/{order.id}/checklists"
				aria-label="Checklists de salida y retorno"
				title="Checklists de salida y retorno"
			>
				<Icon name="listChecks" size={18} />
			</a>
			{#if !isReadOnly && status === 'confirmado' && can('work_orders.cancel')}
				<form method="POST" action="?/cancel" use:enhance>
					<button
						type="submit"
						class="grupo-btn peligro"
						aria-label="Cancelar la orden"
						title="Cancelar la orden"
					>
						<Icon name="x" size={18} />
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>

{#if form?.error}
	<div class="alert-error" role="alert">{form.error}</div>
{/if}
{#if errorPdf}
	<div class="alert-error" role="alert">{errorPdf}</div>
{/if}
{#if entregado}
	<div class="alert-success" role="status">Entrega registrada en el conduce {entregado}.</div>
{/if}
{#if devuelto}
	<div class="alert-success" role="status">
		Devolución registrada en el conduce {devuelto}.
		{#if incidencias > 0}
			Se abrieron {incidencias} {incidencias === 1 ? 'incidencia' : 'incidencias'}.
		{/if}
	</div>
{/if}

<div class="detail-layout">
	<div class="detail-main">
		<section class="panel">
			<h2 class="titulo-seccion">Datos generales</h2>
			<!-- Filas de etiqueta y valor, no cuatro tarjetas de KPI. Las de antes
			     eran `.metric`, la caja del dashboard: `--sp-5` de relleno por los
			     cuatro lados y el valor a `--font-2xl`, unos 120 px para cuatro
			     datos de una línea, y todo dentro de otro panel. -->
			<div class="info-rows">
				<div class="info-row">
					<span class="info-label">Cliente</span>
					<span class="info-value">{data.customer?.name ?? '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Evento</span>
					<span class="info-value">
						{#if data.event}
							<a href="/events/{data.event.id}">{data.event.name}</a>
						{:else}
							—
						{/if}
					</span>
				</div>
				<div class="info-row">
					<span class="info-label">Fecha de operación</span>
					<span class="info-value">{formatDate(order.date)}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Responsable</span>
					<span class="info-value">{order.responsible_person || '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Vehículo</span>
					<span class="info-value">{order.vehicle || '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Cotización origen</span>
					<span class="info-value">
						{#if data.quote}
							<a href="/quotes/{data.quote.id}">{data.quote.quote_number || `#${data.quote.id}`}</a>
						{:else}
							—
						{/if}
					</span>
				</div>
			</div>
		</section>

		<section class="panel">
			<h2 class="titulo-seccion">Equipos</h2>
			{#if items.length === 0}
				<p class="empty-state">Sin artículos.</p>
			{:else}
				<table class="data-table">
					<thead>
						<tr>
							<th>Artículo</th>
							<th>Código</th>
							<th class="num">Reservado</th>
							<th class="num">Entregado</th>
							<th class="num">Devuelto</th>
							<th class="num">Precio</th>
							<th>Estado</th>
						</tr>
					</thead>
					<tbody>
						{#each items as item (item.id)}
							<tr>
								<td>{item.name}</td>
								<td>{item.internal_code || '—'}</td>
								<td class="num">{item.quantity}</td>
								<td class="num">{item.delivered_quantity ?? 0}</td>
								<td class="num">{item.returned_quantity ?? 0}</td>
								<td class="num">{formatMoney(item.price)}</td>
								<td>
									<span class="badge {statusBadgeClass(item.status || 'reserved')}">
										{statusLabel(item.status || 'reserved')}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<!-- Es lo que el montador lee el día del evento, así que va con los
		     equipos y no escondido en una columna estrecha. -->
		<section class="panel">
			<h2 class="titulo-seccion">Instrucciones de montaje / observaciones</h2>
			{#if order.notes}
				<p class="notas">{order.notes}</p>
			{:else}
				<p class="empty-state">Sin instrucciones.</p>
			{/if}
		</section>
	</div>

	<aside class="detail-side">
		<section class="panel">
			<div class="cabecera-tarjeta">
				<h2 class="titulo-seccion">Facturas</h2>
				{#if data.billable.length > 0 && can('invoices.create')}
					<a class="btn-secondary btn-sm" href="/invoices/new?order={order.id}">
						Facturar {data.billable.length}
					</a>
				{/if}
			</div>
			{#if data.invoices.length === 0}
				<p class="empty-state">
					{data.billable.length > 0
						? 'Hay entregas sin facturar.'
						: 'Sin facturas. Solo se factura lo que ya se entregó.'}
				</p>
			{:else}
				{#each data.invoices as invoice (invoice.id)}
					<div class="resumen">
						<div class="resumen-datos">
							<a href="/invoices/{invoice.id}">{invoice.invoice_number}</a>
							<span class="badge {statusBadgeClass(invoice.status)}">
								{statusLabel(invoice.status)}
							</span>
						</div>
						<span class="resumen-nota">
							{formatMoney(invoice.total)} · cobrado {formatMoney(invoice.paid)}
						</span>
					</div>
				{/each}
			{/if}
		</section>

		<section class="panel">
			<h2 class="titulo-seccion">Incidencias</h2>
			{#if data.incidents.length === 0}
				<p class="empty-state">Sin incidencias.</p>
			{:else}
				{#each data.incidents as incident (incident.id)}
					<div class="resumen">
						<div class="resumen-datos">
							<!-- Antes se pintaban `type`, `severity` y `status` CRUDOS, con
							     el enum tal cual: la única sección de la ficha que no pasaba
							     por `statusLabel`. -->
							<span class="resumen-numero">{statusLabel(incident.type)}</span>
							<span class="badge {statusBadgeClass(incident.status)}">
								{statusLabel(incident.status)}
							</span>
						</div>
						<span class="resumen-nota">{incident.description}</span>
						{#if Number(incident.estimated_cost || 0) > 0}
							<span class="resumen-nota">Costo estimado {formatMoney(incident.estimated_cost)}</span>
						{/if}
					</div>
				{/each}
			{/if}
		</section>

		<section class="panel">
			<h2 class="titulo-seccion">Movimientos de stock</h2>
			{#if data.stockMovements.length === 0}
				<p class="empty-state">Sin movimientos.</p>
			{:else}
				<table class="data-table compacta">
					<thead>
						<tr><th>Tipo</th><th class="num">Cant.</th><th>Fecha</th></tr>
					</thead>
					<tbody>
						{#each data.stockMovements as movement (movement.id)}
							<tr>
								<td>{statusLabel(movement.type)}</td>
								<td class="num">{movement.quantity}</td>
								<!-- `formatDate`, no `String(...).slice(0,19)`. -->
								<td>{formatDate(movement.created_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	</aside>
</div>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename={pdfNombre} title="Vista previa de la orden" />

<style>
	/* La cabecera reutiliza `.herramientas` de theme.css —la misma fila que los
	   listados— y solo añade el bloque del título. */
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

	/* El botón de cancelar vive en el grupo con los demás, pero en rojo: es el
	   único que destruye. `color` y no `background`, para no competir con la
	   acción primaria de al lado. */
	.grupo-btn.peligro {
		color: var(--danger-text);
	}

	.grupo-btn.peligro:hover:not(:disabled) {
		background: var(--danger-bg);
		color: var(--danger-text);
	}

	/* El `.grupo` de theme.css espera botones como hijos DIRECTOS para su borde
	   compartido; el de cancelar va envuelto en su `<form>`. Se le quita al
	   formulario cualquier caja para que el botón siga siendo el hijo visual. */
	.grupo form {
		display: contents;
	}

	.titulo-seccion {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		font-weight: 600;
	}

	.cabecera-tarjeta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.cabecera-tarjeta .titulo-seccion {
		margin-bottom: var(--sp-3);
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	/* `pre-wrap`: las instrucciones de montaje se escriben en varias líneas y
	   hasta ahora se pintaban corridas. */
	.notas {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.5;
	}

	.resumen {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.resumen + .resumen {
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.resumen-datos {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}

	.resumen-numero {
		font-weight: 600;
	}

	.resumen-nota {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	/* La columna lateral es estrecha: su tabla respira menos. */
	.compacta th,
	.compacta td {
		padding: var(--sp-1) var(--sp-2);
	}
</style>
