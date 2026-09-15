<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import { PERIODOS, PERIODO_LABELS, formatMoney, rangoDelPeriodo } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';

	let { data } = $props();

	const statuses = [
		'confirmado',
		'en_preparacion',
		'entregado',
		'parcialmente_devuelto',
		'devuelto',
		'cerrado',
		'cancelado'
	];
	const opcionesEstado = [
		{ value: '', label: 'Todos los estados' },
		...statuses.map((st) => ({ value: st, label: st }))
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
		<a
			class="btn-secondary no-print"
			href="/reports/orders.csv?{new URLSearchParams({ search: data.search, status: data.status, dateFrom: data.dateFrom, dateTo: data.dateTo }).toString()}"
		>
			Exportar CSV
		</a>
		<button type="button" class="btn-primary" onclick={() => window.print()}>Imprimir</button>
	</div>
</div>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Buscar cliente', value: data.search }}
		dates={[
			{ name: 'dateFrom', label: 'Desde', value: data.dateFrom },
			{ name: 'dateTo', label: 'Hasta', value: data.dateTo }
		]}
	/>

	{#if data.orders.length === 0}
		<p class="empty-state">Sin órdenes para los filtros seleccionados.</p>
	{:else}
		<table class="data-table print-document">
			<thead>
				<tr>
					<th>Número</th>
					<th>Cliente</th>
					<th>Evento</th>
					<th>Estado</th>
					<th>Fecha</th>
					<th>Total</th>
				</tr>
			</thead>
			<tbody>
				{#each data.orders as order (order.id)}
					<tr>
						<td>{order.order_number || `#${order.id}`}</td>
						<td>{order.client_name}</td>
						<td>{order.event_name}</td>
						<td>{order.status}</td>
						<td>{order.date || '—'}</td>
						<td>{formatMoney(order.total || 0)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
