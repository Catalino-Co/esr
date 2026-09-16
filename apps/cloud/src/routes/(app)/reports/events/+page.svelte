<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { EventCalendar, Icon, PdfPreviewModal, downloadBlob } from '@esr/ui';
	import {
		PERIODOS,
		PERIODO_LABELS,
		rangoDelPeriodo,
		statusBadgeClass,
		statusLabel
	} from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';

	let { data } = $props();

	let verPdf = $state(false);
	let pdfUrl = $state('');
	let generandoPdf = $state(false);
	let generandoExcel = $state(false);
	let errorExportar = $state('');

	// En reportes se exporta a Excel y PDF, nunca CSV -ver memoria
	// `reports-exportan-excel-pdf`.
	async function exportarExcel() {
		if (generandoExcel) return;
		generandoExcel = true;
		errorExportar = '';
		try {
			const { generateEventsWorkbook } = await import('@esr/reports/events');
			const { blob, filename } = await generateEventsWorkbook(data.events);
			downloadBlob(blob, filename);
		} catch (e) {
			errorExportar = `No se pudo generar el Excel. ${e?.message ?? ''}`.trim();
		} finally {
			generandoExcel = false;
		}
	}

	async function abrirPdf() {
		if (generandoPdf) return;
		generandoPdf = true;
		errorExportar = '';
		try {
			// Import DINAMICO: jsPDF no tiene por que estar en el bundle inicial,
			// y `doc.output('bloburl')` necesita `Blob`/`URL`, que no existen en SSR.
			const { generateEventsReportPDF } = await import('@esr/reports/events');
			const { url } = generateEventsReportPDF(data.events, 'preview', data.companyInfo);
			pdfUrl = url;
			verPdf = true;
		} catch (e) {
			errorExportar = `No se pudo generar el PDF. ${e?.message ?? ''}`.trim();
		} finally {
			generandoPdf = false;
		}
	}

	const ESTADOS = [
		{ value: '', label: 'Cualquier estado' },
		{ value: 'tentativo', label: 'Tentativo' },
		{ value: 'confirmado', label: 'Confirmado' },
		{ value: 'completado', label: 'Completado' },
		{ value: 'cancelado', label: 'Cancelado' }
	];

	/**
	 * El color de cada tipo, resuelto POR NOMBRE. Mismo criterio que /events:
	 * `event_type` guarda el nombre en texto libre, no una clave ajena.
	 */
	const colores = $derived(
		new Map(data.eventTypes.map((t) => [String(t.name).trim().toLowerCase(), t.color]))
	);
	const GRIS = '#94a3b8';
	/** @param {{ event_type?: string }} ev */
	const colorDe = (ev) => colores.get(String(ev.event_type ?? '').trim().toLowerCase()) || GRIS;

	/** Navega conservando el resto de la query. Mismo helper que Órdenes. */
	/** @param {Record<string, string | null>} cambios */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	/** @param {string} periodo */
	function aplicarPeriodo(periodo) {
		const rango = rangoDelPeriodo(/** @type {any} */ (periodo));
		irCon({ dateFrom: rango.desde, dateTo: rango.hasta });
	}

	/* Interruptor Tabla/Calendario: el rango de fechas solo aplica a la Tabla,
	   igual que en /events -el Calendario pagina de mes en mes en memoria y no
	   pide datos nuevos al cambiar de mes. */
	let calendario = $state(false);

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/reports" aria-label="Volver a Reportes" title="Volver a Reportes">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar"
			title="Recargar"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
		<button
			type="button"
			class="grupo-btn"
			class:encendido={calendario}
			aria-pressed={calendario}
			aria-label={calendario ? 'Ver como tabla' : 'Ver como calendario'}
			title={calendario ? 'Ver como tabla' : 'Ver como calendario'}
			onclick={() => (calendario = !calendario)}
		>
			<Icon name="calendar" size={18} />
		</button>
	</div>

	<div class="herramientas-datos">
		{#if !calendario}
			<div class="grupo" role="group" aria-label="Rango rápido">
				{#each PERIODOS as periodo (periodo)}
					<button
						type="button"
						class="grupo-btn grupo-btn--texto"
						class:encendido={data.rangoActivo === periodo}
						aria-pressed={data.rangoActivo === periodo}
						onclick={() => aplicarPeriodo(periodo)}
					>
						{PERIODO_LABELS[periodo]}
					</button>
				{/each}
			</div>
		{/if}
		<StatusSelect
			name="status"
			value={data.status}
			options={ESTADOS}
			label="Estado"
			onchange={(e) => irCon({ status: e.currentTarget.value })}
		/>
		<button
			type="button"
			class="btn-secondary no-print"
			onclick={exportarExcel}
			disabled={generandoExcel}
		>
			{generandoExcel ? 'Generando…' : 'Exportar Excel'}
		</button>
		<button type="button" class="btn-primary no-print" onclick={abrirPdf} disabled={generandoPdf}>
			{generandoPdf ? 'Generando…' : 'Vista previa PDF'}
		</button>
	</div>
</div>

{#if errorExportar}
	<p class="form-error no-print">{errorExportar}</p>
{/if}

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre, cliente o lugar', value: data.search }}
		dates={calendario
			? []
			: [
					{ name: 'dateFrom', label: 'Desde', value: data.dateFrom },
					{ name: 'dateTo', label: 'Hasta', value: data.dateTo }
				]}
	/>

	{#if calendario}
		<EventCalendar events={data.eventsCalendario} colorOf={colorDe} />
	{:else if data.events.length === 0}
		<p class="empty-state">Sin eventos para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Evento</th>
					<th>Cliente</th>
					<th>Lugar</th>
					<th>Estado</th>
				</tr>
			</thead>
			<tbody>
				{#each data.events as ev (ev.id)}
					<tr>
						<td class="fecha" style="border-left-color: {colorDe(ev)}">{ev.date || '—'}</td>
						<td>
							<span class="nombre">{ev.name}</span>
							{#if ev.event_type}
								<span class="tipo">
									<span class="punto" style="background: {colorDe(ev)}"></span>
									{ev.event_type}
								</span>
							{/if}
						</td>
						<td>{ev.client_name}</td>
						<td>{ev.location || '—'}</td>
						<td><span class="badge {statusBadgeClass(ev.status)}">{statusLabel(ev.status)}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename="Eventos.pdf" title="Vista previa de eventos" />

<style>
	.fecha {
		border-left: 3px solid transparent;
		padding-left: var(--sp-3);
		font-weight: 500;
		white-space: nowrap;
	}

	.nombre {
		display: block;
		font-weight: 600;
	}

	.tipo {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.punto {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
