<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { formatMoney, formatNumber } from '@esr/core';
	import { Icon, PdfPreviewModal } from '@esr/ui';
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
			const { generateInventoryPDF } = await import('@esr/reports/inventory');
			const { url } = generateInventoryPDF(data.items, 'preview', data.companyInfo);
			pdfUrl = url;
			verPdf = true;
		} catch (e) {
			errorExportar = `No se pudo generar el PDF. ${e?.message ?? ''}`.trim();
		} finally {
			generandoPdf = false;
		}
	}

	/** Las tres condiciones físicas. En sentence case, como el resto. */
	/** @type {Record<string, string>} */
	const CONDICIONES = {
		disponible: 'Disponible',
		mantenimiento: 'Mantenimiento',
		retirado: 'Retirado',
		no_disponible: 'No disponible'
	};
	const opcionesCondicion = [
		{ value: '', label: 'Cualquier condición' },
		...Object.entries(CONDICIONES).map(([value, label]) => ({ value, label }))
	];
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
			name="status"
			value={data.status}
			options={opcionesCondicion}
			label="Condición"
			onchange={(e) => irCon({ status: e.currentTarget.value })}
		/>
		<StatusSelect
			name="category"
			value={data.category}
			options={opcionesCategoria}
			label="Categoría"
			onchange={(e) => irCon({ category: e.currentTarget.value })}
		/>
		<a
			class="btn-secondary no-print"
			href="/reports/inventory.csv?{new URLSearchParams({ search: data.search, status: data.status, category: data.category }).toString()}"
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
	<p class="panel-hint no-print">
		El valor se calcula con
		{data.valuationRule === 'promedio3'
			? 'el promedio de las 3 últimas compras'
			: 'el último precio de compra'}, según
		<a href="/settings/general">Configuración › Generales</a>.
	</p>

	<FilterBar search={{ name: 'search', placeholder: 'Nombre o código', value: data.search }} />

	{#if data.items.length === 0}
		<p class="empty-state">Sin artículos para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Artículo</th>
					<th>SKU</th>
					<th>Categoría</th>
					<th>Total</th>
					<th>Disponible</th>
					<th>Comprometido</th>
					<th>Mínimo</th>
					<th>Condición</th>
					<th>Valor</th>
				</tr>
			</thead>
			<tbody>
				{#each data.items as item (item.id)}
					<tr>
						<td>{item.name}</td>
						<td>{item.internal_code || '—'}</td>
						<td>{item.category_name}</td>
						<td>{formatNumber(item.total_quantity ?? 0)}</td>
						<td>{formatNumber(item.available_quantity ?? 0)}</td>
						<td>{formatNumber(item.committed_quantity)}</td>
						<td>{formatNumber(item.min_stock ?? 0)}</td>
						<td>{CONDICIONES[item.physical_status ?? ''] ?? '—'}</td>
						<!-- «—» y no cero cuando no hay costo: las entradas anteriores a
						     esta reforma no lo guardaban, y un cero sería inventárselo. -->
						<td>
							{item.valuation_cost == null
								? '—'
								: formatMoney(Number(item.valuation_cost) * Number(item.total_quantity ?? 0))}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename="Inventario.pdf" title="Vista previa del inventario" />
