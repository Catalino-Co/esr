<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon, PdfPreviewModal } from '@esr/ui';
	import { formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
	import EventoCampos from '../EventoCampos.svelte';
	import VincularDocumento from './VincularDocumento.svelte';
	import { can } from '$lib/can';
	import { dangerModal } from '$lib/stores/dangerModal';
	import { toasts } from '$lib/stores/toasts';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
		if (form?.success) toasts.success('Evento guardado.');
	});

	/* Lo tecleado gana sobre lo guardado, para no perderlo en un error. */
	const valores = $derived(form?.values ?? data.event);

	/* ── Imprimir ──────────────────────────────────────────────────────────
	 * Mismo patrón que la cotización: el servidor manda los datos Y registra
	 * `document.printed`, y el PDF se arma en cliente con jsPDF.
	 */
	let verPdf = $state(false);
	let pdfUrl = $state('');
	let pdfNombre = $state('evento.pdf');
	let generando = $state(false);

	async function imprimir() {
		if (generando) return;
		generando = true;
		pdfUrl = '';
		verPdf = true;
		try {
			const res = await fetch(`${page.url.pathname}/document`, { method: 'POST' });
			if (!res.ok) throw new Error('El servidor rechazó la petición.');
			const { company, event, quote, order } = await res.json();
			/* Import DINÁMICO: jsPDF pesa ~400 KB, y en SSR un import de nivel
			   superior se evalúa también en el servidor, donde `Blob` y
			   `URL.createObjectURL` no existen. */
			const { generateEventPDF } = await import('@esr/reports/events');
			const { url, filename } = generateEventPDF(event, { quote, order }, 'preview', company);
			pdfUrl = url;
			pdfNombre = filename;
		} catch (/** @type {any} */ e) {
			verPdf = false;
			dangerModal.show(`No se pudo generar el documento. ${e?.message ?? ''}`.trim());
		} finally {
			generando = false;
		}
	}

	const alGuardar = () => async (/** @type {{ update: Function }} */ { update }) =>
		await update({ reset: false });

	/** ── Vincular ─────────────────────────────────────────────────────────
	 * El diálogo vive en la URL (`?vincular=cotizacion`), como el alta de
	 * cotizaciones: sobrevive a un refresco y «atrás» lo cierra. Aquí sí cuesta
	 * una carga —las candidatas se piden en el `load`, dentro de un `if`—, y a
	 * cambio la visita normal deja de pagar las dos consultas de 200 filas que
	 * pagaba antes, en cada entrada Y en cada guardado.
	 *
	 * `keepFocus: true` en los dos sentidos, y no es adorno: sin él en la
	 * apertura, SvelteKit devuelve el foco al `<body>` antes de que el diálogo
	 * apunte a quien lo abrió, y el foco no volvería al botón al cerrar; sin él
	 * en el cierre, se lo vuelve a quitar justo después de devolverlo.
	 *
	 * @param {Record<string, string | null>} cambios
	 * @param {boolean} [invalidar]
	 */
	function irCon(cambios, invalidar = false) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, valor);
		}
		goto(url, { noScroll: true, keepFocus: true, invalidateAll: invalidar });
	}

	const cerrarVinculo = () => irCon({ vincular: null, buscarDoc: null });
	/* Al vincular se cierra Y se invalida en una sola navegación: la tarjeta
	   lateral cambiada detrás es la confirmación. */
	const vinculoHecho = () => irCon({ vincular: null, buscarDoc: null }, true);
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/events" aria-label="Volver a eventos" title="Volver a eventos">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={imprimir}
			disabled={generando}
			aria-label="Imprimir el evento"
			title="Imprimir el evento"
		>
			<Icon name="printer" size={18} />
		</button>
	</div>

	<!-- Aquí había un badge del estado, que solo repetía lo que dice su propio
	     `<select>` unas líneas más abajo. El sitio lo ocupan ahora los dos
	     botones de vincular, que antes eran dos desplegables metidos DENTRO del
	     formulario del evento: enganchar una cotización obligaba a pulsar
	     «Guardar cambios» del evento entero. -->
	{#if can('events.update')}
		<div class="herramientas-datos">
			<button type="button" class="btn-secondary" onclick={() => irCon({ vincular: 'cotizacion' })}>
				Vincular cotización
			</button>
			<button type="button" class="btn-secondary" onclick={() => irCon({ vincular: 'orden' })}>
				Vincular orden
			</button>
		</div>
	{/if}
</div>

<div class="ficha">
	<section class="panel">
		<h2 class="panel-titulo">{data.event.name}</h2>

		<form method="POST" action="?/update" class="form-grid" use:enhance={alGuardar}>
			<EventoCampos
				{valores}
				customers={data.customers}
				eventTypes={data.eventTypes}
				fieldErrors={form?.fieldErrors ?? {}}
				conEstado={true}
			/>
			{#if can('events.update')}
				<div class="form-actions">
					<button type="submit" class="btn-primary">Guardar cambios</button>
				</div>
			{/if}
		</form>
	</section>

	<aside class="columna">
		<!-- ── Resumen: cotización ────────────────────────────────────────────
			Escueto a propósito: número, total y si está aprobada. El detalle está
			en su propio documento, y repetirlo aquí sería mantener dos verdades.
		-->
		<section class="panel tarjeta">
			<h3 class="tarjeta-titulo">Cotización</h3>
			{#if data.quotes.length === 0}
				<p class="panel-hint">Sin cotización vinculada.</p>
				{#if can('quotes.create')}
					<a class="btn-secondary btn-sm" href="/quotes?nueva=1&eventId={data.event.id}">
						Crear cotización
					</a>
				{/if}
			{:else}
				{#each data.quotes as quote (quote.id)}
					<div class="resumen">
						<div class="resumen-datos">
							<span class="resumen-numero">{quote.quote_number || `#${quote.id}`}</span>
							<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
						</div>
						<span class="resumen-total">{formatMoney(quote.total)}</span>
						<a class="btn-view" href="/quotes/{quote.id}">Ver</a>
					</div>
				{/each}
			{/if}

			<!-- La tarjeta enseña lo vivo, así que aquí hay que decir lo que se está
			     callando: canceladas, inactivas y archivadas. Va FUERA del `{#if}`,
			     en las dos ramas. Si las seis del evento están canceladas, arriba
			     pone «Sin cotización vinculada» —y ese es justo el caso que motivó
			     el cambio: esconder ahí la salida sería el peor sitio. -->
			{#if data.quotesTotal > data.quotes.length}
				<a class="historial" href="/events/{data.event.id}/quotes">
					Historial de cotizaciones ({data.quotesTotal})
				</a>
			{/if}
		</section>

		<!-- ── Resumen: orden ────────────────────────────────────────────────
			Solo el número y el estado, que es lo que se pidió. No lleva importe:
			el dinero del evento es el de la cotización.
		-->
		<section class="panel tarjeta">
			<h3 class="tarjeta-titulo">Orden</h3>
			{#if data.orders.length === 0}
				<p class="panel-hint">Sin orden vinculada.</p>
			{:else}
				{#each data.orders as order (order.id)}
					<div class="resumen">
						<div class="resumen-datos">
							<span class="resumen-numero">
								{order.order_number || `WO-${String(order.id).padStart(5, '0')}`}
							</span>
							<span class="badge {statusBadgeClass(order.status)}">{statusLabel(order.status)}</span>
						</div>
						<a class="btn-view" href="/work-orders/{order.id}">Ver</a>
					</div>
				{/each}
			{/if}
		</section>
	</aside>
</div>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename={pdfNombre} title="Vista previa del evento" />

<!-- Montado bajo un `{#if}`: cada apertura nace limpia y el cierre pasa siempre
     por `onclose`, que cubre las tres vías (✕, backdrop y Escape). -->
{#if data.vincular && data.candidatos}
	<VincularDocumento
		tipo={data.candidatos.tipo}
		filas={data.candidatos.filas}
		hayMas={data.candidatos.hayMas}
		busqueda={data.buscarDoc}
		onbuscar={(valor) => irCon({ vincular: data.vincular, buscarDoc: valor })}
		onhecho={vinculoHecho}
		onclose={cerrarVinculo}
	/>
{/if}

<style>
	/* Cuerpo a la izquierda, resúmenes en columna estrecha a la derecha: la
	   misma disposición que la ficha de cotización. */
	.ficha {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem);
		gap: var(--sp-4);
		align-items: start;
	}

	.columna {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.panel-titulo {
		margin: 0 0 var(--sp-4);
		font-size: var(--font-lg);
		font-weight: 600;
	}

	.tarjeta-titulo {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		font-weight: 600;
	}

	.resumen {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		align-items: flex-start;
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

	.resumen-total {
		font-size: var(--font-lg);
		font-weight: 600;
	}

	.historial {
		display: inline-block;
		margin-top: var(--sp-3);
		font-size: var(--font-sm);
	}

	@media (max-width: 900px) {
		.ficha {
			grid-template-columns: 1fr;
		}
	}
</style>
