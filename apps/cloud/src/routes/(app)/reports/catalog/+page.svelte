<script>
	import { formatMoney } from '@esr/core';
	import { PdfPreviewModal, downloadBlob } from '@esr/ui';

	let { data } = $props();

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

<section class="panel">
	<div class="page-header">
		<h1>Reporte — Catálogo de productos</h1>
		<div class="page-header-actions no-print">
			<a class="btn-secondary" href="/reports">Volver</a>
			<button type="button" class="btn-secondary" onclick={descargarExcel} disabled={generandoExcel}>
				{generandoExcel ? 'Generando…' : 'Exportar Excel'}
			</button>
			<button type="button" class="btn-secondary" onclick={abrirPdf} disabled={generandoPdf}>
				{generandoPdf ? 'Generando…' : 'Vista previa PDF'}
			</button>
			<button type="button" class="btn-primary" onclick={() => window.print()}>Imprimir</button>
		</div>
	</div>

	{#if errorExportar}
		<p class="form-error no-print">{errorExportar}</p>
	{/if}

	<p class="panel-hint no-print">Solo artículos activos: es una lista de precios, no un inventario.</p>

	<form class="filter-bar no-print" method="GET">
		<input type="search" name="search" placeholder="Buscar" value={data.search} />
		<select name="category">
			<option value="">Todas las categorías</option>
			{#each data.categories as cat (cat.id)}
				<option value={cat.id} selected={String(data.category) === String(cat.id)}>{cat.name}</option>
			{/each}
		</select>
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

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
	.page-header-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
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
	@media print {
		.no-print {
			display: none !important;
		}
	}
</style>
