<script>
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Icon, PdfPreviewModal } from '@esr/ui';
	import { formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
	import EventoCampos from '../EventoCampos.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	/* Lo tecleado gana sobre lo guardado, para no perderlo en un error. */
	const valores = $derived(form?.values ?? data.event);

	/* ── Imprimir ──────────────────────────────────────────────────────────
	 * Mismo patrón que la cotización: el servidor manda los datos Y registra
	 * `document.printed`, y el PDF se arma en cliente con jsPDF.
	 */
	let verPdf = $state(false);
	let pdfUrl = $state('');
	let pdfNombre = $state('evento.pdf');
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
			errorPdf = `No se pudo generar el documento. ${e?.message ?? ''}`.trim();
		} finally {
			generando = false;
		}
	}

	const alGuardar = () => async (/** @type {{ update: Function }} */ { update }) =>
		await update({ reset: false });
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

	<div class="herramientas-datos">
		<span class="badge {statusBadgeClass(data.event.status)}">{statusLabel(data.event.status)}</span>
	</div>
</div>

{#if errorPdf}<div class="alert-error" role="alert">{errorPdf}</div>{/if}
{#if form?.error}<div class="alert-error" role="alert">{form.error}</div>{/if}
{#if form?.success}<div class="alert-success" role="status">Evento guardado.</div>{/if}

<div class="ficha">
	<section class="panel">
		<h2 class="panel-titulo">{data.event.name}</h2>

		<form method="POST" action="?/update" class="form-grid" use:enhance={alGuardar}>
			<EventoCampos
				{valores}
				customers={data.customers}
				eventTypes={data.eventTypes}
				quotes={data.quotesLibres}
				orders={data.ordersLibres}
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
		</section>

		<!-- ── Resumen: orden de trabajo ─────────────────────────────────────
			Solo el número y el estado, que es lo que se pidió. No lleva importe:
			el dinero del evento es el de la cotización.
		-->
		<section class="panel tarjeta">
			<h3 class="tarjeta-titulo">Orden de trabajo</h3>
			{#if data.orders.length === 0}
				<p class="panel-hint">Sin orden de trabajo vinculada.</p>
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

	@media (max-width: 900px) {
		.ficha {
			grid-template-columns: 1fr;
		}
	}
</style>
