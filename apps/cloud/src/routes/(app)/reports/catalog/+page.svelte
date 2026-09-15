<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { formatMoney } from '@esr/core';
	import { Icon, PdfPreviewModal, downloadBlob } from '@esr/ui';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';

	let { data } = $props();

	const opcionesCategoria = [
		{ value: '', label: 'Todas las categorías' },
		...data.categories.map((cat) => ({ value: String(cat.id), label: cat.name }))
	];

	/** Navega conservando el resto de la query. Mismo helper que Inventario. */
	/** @param {Record<string, string | null>} cambios */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
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

	let verPdf = $state(false);
	let pdfUrl = $state('');
	let generandoPdf = $state(false);
	let generandoExcel = $state(false);
	let errorExportar = $state('');

	async function abrirPdf() {
		if (generandoPdf) return;
		generandoPdf = true;
		errorExportar = '';
		try {
			// Import DINAMICO: jsPDF no tiene por que estar en el bundle inicial,
			// y `doc.output('bloburl')` necesita `Blob`/`URL`, que no existen en SSR.
			const { generateCatalogPDF } = await import('@esr/reports/catalog');
			const { url } = generateCatalogPDF(data.groups, 'preview', data.companyInfo);
			pdfUrl = url;
			verPdf = true;
		} catch (e) {
			errorExportar = `No se pudo generar el PDF. ${e?.message ?? ''}`.trim();
		} finally {
			generandoPdf = false;
		}
	}

	async function descargarExcel() {
		if (generandoExcel) return;
		generandoExcel = true;
		errorExportar = '';
		try {
			const { generateCatalogWorkbook } = await import('@esr/reports/catalog');
			const { blob, filename } = await generateCatalogWorkbook(data.rows);
			downloadBlob(blob, filename);
		} catch (e) {
			errorExportar = `No se pudo generar el Excel. ${e?.message ?? ''}`.trim();
		} finally {
			generandoExcel = false;
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
		<StatusSelect
			name="category"
			value={data.category}
			options={opcionesCategoria}
			label="Categoría"
			onchange={(e) => irCon({ category: e.currentTarget.value })}
		/>
		<button type="button" class="btn-secondary no-print" onclick={descargarExcel} disabled={generandoExcel}>
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
	<p class="panel-hint no-print">Solo artículos activos: es una lista de precios, no un inventario.</p>

	<FilterBar search={{ name: 'search', placeholder: 'Nombre o código', value: data.search }} />

	{#if data.groups.length === 0}
		<p class="empty-state">Sin artículos activos para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Código</th>
					<th>Ítem</th>
					<th>Unidad</th>
					<th>Precio de renta</th>
				</tr>
			</thead>
			<tbody>
				{#each data.groups as cat (cat.categoryName)}
					<tr class="fila-grupo"><th colspan="4" scope="colgroup">{cat.categoryName}</th></tr>
					{#each cat.subcategories as sub (sub.subcategoryName)}
						<tr class="fila-subgrupo"><th colspan="4" scope="colgroup">{sub.subcategoryName}</th></tr>
						{#each sub.items as item (item.id)}
							<tr>
								<td>{item.code || '—'}</td>
								<td>{item.name}</td>
								<td>{item.uom}</td>
								<td>{formatMoney(item.price)}</td>
							</tr>
						{/each}
					{/each}
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename="Catalogo_de_productos.pdf" title="Vista previa del catálogo" />

<style>
	.fila-grupo th {
		text-align: left;
		background: var(--surface-sunken);
		font-weight: 700;
	}
	.fila-subgrupo th {
		text-align: left;
		background: var(--surface);
		font-style: italic;
		color: var(--text-secondary);
	}
</style>
