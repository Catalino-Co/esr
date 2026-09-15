<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon, PdfPreviewModal } from '@esr/ui';
	import { PERIODOS, PERIODO_LABELS, formatMoney, rangoDelPeriodo } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';

	let { data } = $props();

	let verPdf = $state(false);
	let pdfUrl = $state('');
	let generandoPdf = $state(false);
	let errorExportar = $state('');

	async function abrirPdf() {
		if (generandoPdf) return;
		generandoPdf = true;
		errorExportar = '';
		try {
			// Import DINAMICO: jsPDF no tiene por que estar en el bundle inicial,
			// y `doc.output('bloburl')` necesita `Blob`/`URL`, que no existen en SSR.
			const { generateIncidentsReportPDF } = await import('@esr/reports/incidents');
			const { url } = generateIncidentsReportPDF(data.incidents, 'preview', data.companyInfo);
			pdfUrl = url;
			verPdf = true;
		} catch (e) {
			errorExportar = `No se pudo generar el PDF. ${e?.message ?? ''}`.trim();
		} finally {
			generandoPdf = false;
		}
	}

	const opcionesEstado = [
		{ value: '', label: 'Todos los estados' },
		{ value: 'reportado', label: 'Reportado' },
		{ value: 'en_revision', label: 'En revisión' },
		{ value: 'resuelto', label: 'Resuelto' },
		{ value: 'cancelado', label: 'Cancelado' }
	];
	const opcionesSeveridad = [
		{ value: '', label: 'Todas las severidades' },
		{ value: 'baja', label: 'Baja' },
		{ value: 'media', label: 'Media' },
		{ value: 'alta', label: 'Alta' },
		{ value: 'critica', label: 'Crítica' }
	];

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
	</div>

	<div class="herramientas-datos">
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
		<StatusSelect
			name="status"
			value={data.status}
			options={opcionesEstado}
			label="Estado"
			onchange={(e) => irCon({ status: e.currentTarget.value })}
		/>
		<StatusSelect
			name="severity"
			value={data.severity}
			options={opcionesSeveridad}
			label="Severidad"
			onchange={(e) => irCon({ severity: e.currentTarget.value })}
		/>
		<a
			class="btn-secondary no-print"
			href="/reports/incidents.csv?{new URLSearchParams({ status: data.status, severity: data.severity, type: data.type, dateFrom: data.dateFrom, dateTo: data.dateTo }).toString()}"
		>
			Exportar CSV
		</a>
		<button type="button" class="btn-primary no-print" onclick={abrirPdf} disabled={generandoPdf}>
			{generandoPdf ? 'Generando…' : 'Vista previa PDF'}
		</button>
	</div>
</div>

{#if errorExportar}
	<p class="form-error no-print">{errorExportar}</p>
{/if}

<section class="panel">
	<!-- Reusa el slot de busqueda de FilterBar para "Tipo": es el unico campo
	     de texto libre de este reporte, no una busqueda multicolumna, pero
	     la misma pastilla visual encaja igual. -->
	<FilterBar
		search={{ name: 'type', placeholder: 'Buscar por tipo…', value: data.type }}
		dates={[
			{ name: 'dateFrom', label: 'Desde', value: data.dateFrom },
			{ name: 'dateTo', label: 'Hasta', value: data.dateTo }
		]}
	/>

	{#if data.incidents.length === 0}
		<p class="empty-state">Sin incidencias para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Tipo</th>
					<th>Severidad</th>
					<th>Estado</th>
					<th>Orden</th>
					<th>Artículo</th>
					<th>Descripción</th>
					<th>Costo est.</th>
					<th>Fecha</th>
				</tr>
			</thead>
			<tbody>
				{#each data.incidents as incident (incident.id)}
					<tr>
						<td>{incident.type}</td>
						<td>{incident.severity}</td>
						<td>{incident.status}</td>
						<td>{incident.order_label}</td>
						<td>{incident.item_name}</td>
						<td>{incident.short_description || '—'}</td>
						<td>{formatMoney(incident.estimated_cost || 0)}</td>
						<td>{incident.date || incident.created_at?.slice(0, 10) || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename="Incidencias.pdf" title="Vista previa de incidencias" />
