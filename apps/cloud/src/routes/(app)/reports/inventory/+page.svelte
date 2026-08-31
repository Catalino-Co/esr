<script>
	import { formatMoney } from '@esr/core';

	let { data } = $props();

	/** Las tres condiciones físicas. En sentence case, como el resto. */
	/** @type {Record<string, string>} */
	const CONDICIONES = {
		disponible: 'Disponible',
		mantenimiento: 'Mantenimiento',
		retirado: 'Retirado'
	};
</script>

<section class="panel">
	<div class="page-header">
		<h1>Reporte — Inventario</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/reports">Volver</a>
			<a class="btn-secondary" href="/reports/inventory.csv?{new URLSearchParams({ search: data.search, status: data.status, category: data.category }).toString()}">Exportar CSV</a>
			<button type="button" class="btn-primary" onclick={() => window.print()}>Imprimir</button>
		</div>
	</div>

	<p class="panel-hint no-print">
		El valor se calcula con
		{data.valuationRule === 'promedio3'
			? 'el promedio de las 3 últimas compras'
			: 'el último precio de compra'}, según
		<a href="/settings/general">Configuración › Generales</a>.
	</p>

	<form class="filter-bar no-print" method="GET">
		<input type="search" name="search" placeholder="Buscar" value={data.search} />
		<select name="status">
			<option value="">Cualquier condición</option>
			{#each Object.entries(CONDICIONES) as [valor, etiqueta] (valor)}
				<option value={valor} selected={data.status === valor}>{etiqueta}</option>
			{/each}
		</select>
		<select name="category">
			<option value="">Todas las categorías</option>
			{#each data.categories as cat (cat.id)}
				<option value={cat.id} selected={String(data.category) === String(cat.id)}>{cat.name}</option>
			{/each}
		</select>
		<button type="submit" class="btn-secondary">Filtrar</button>
	</form>

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
						<td>{item.total_quantity ?? 0}</td>
						<td>{item.available_quantity ?? 0}</td>
						<td>{item.committed_quantity}</td>
						<td>{item.min_stock ?? 0}</td>
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

<style>
	.page-header-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	@media print {
		.no-print {
			display: none !important;
		}
	}
</style>
