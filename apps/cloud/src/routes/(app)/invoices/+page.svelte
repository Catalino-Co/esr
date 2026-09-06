<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import {
		PERIODOS,
		PERIODO_LABELS,
		formatDate,
		formatDateAbsolute,
		formatMoney,
		rangoDelPeriodo,
		statusBadgeClass,
		statusLabel
	} from '@esr/core';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import BuscarFactura from './BuscarFactura.svelte';
	import { can } from '$lib/can';

	let { data } = $props();

	const ESTADOS = [
		{ value: '', label: 'Cualquier estado' },
		{ value: 'emitida', label: 'Emitida' },
		{ value: 'anulada', label: 'Anulada' }
	];

	/**
	 * El saldo se calcula aquí y no en el servidor porque el listado ya trae
	 * total y cobrado: pedirle una tercera columna al SQL sería repetir una
	 * resta que el navegador hace igual de bien.
	 *
	 * Una factura anulada devuelve `null`, no cero: cero se pinta «Saldada» y
	 * eso diría que se cobró, cuando lo que pasa es que ya no se debe nada
	 * porque el documento no existe a efectos de cobro.
	 */
	function saldo(invoice) {
		if (invoice.status === 'anulada') return null;
		const pendiente = Number(invoice.total ?? 0) - Number(invoice.paid ?? 0);
		return pendiente > 0 ? pendiente : 0;
	}

	/**
	 * Navega conservando el resto de la query. Mismo helper que usan Órdenes,
	 * Cotizaciones, Eventos, Inventario y Movimientos.
	 *
	 * @param {Record<string, string | null>} cambios
	 */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	let temporizador = /** @type {any} */ (null);
	function alBuscar(/** @type {Event & { currentTarget: HTMLInputElement }} */ evento) {
		const valor = evento.currentTarget.value;
		clearTimeout(temporizador);
		temporizador = setTimeout(() => {
			const url = new URL(page.url);
			if (valor) url.searchParams.set('search', valor);
			else url.searchParams.delete('search');
			goto(url, { keepFocus: true, replaceState: true, noScroll: true, invalidateAll: true });
		}, 300);
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

	/* El diálogo de buscar por número NO va en la URL: es una ayuda de
	   navegación de paso, no un estado que compartir. */
	let buscando = $state(false);
</script>

<!--
	Las herramientas van FUERA de la tarjeta y el contenido dentro: navegar la
	pantalla es un trabajo distinto de filtrar sus datos. Clases compartidas
	con Órdenes y Cotizaciones.
-->
<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/dashboard" aria-label="Volver al dashboard" title="Volver al dashboard">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar la lista"
			title="Recargar la lista"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
		<button
			type="button"
			class="grupo-btn"
			onclick={() => (buscando = true)}
			aria-label="Buscar una factura por su número"
			title="Buscar una factura por su número"
		>
			<Icon name="search" size={18} />
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
			options={ESTADOS}
			label="Estado de la factura"
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ status: e.currentTarget.value })}
		/>
		{#if can('invoices.create')}
			<a class="btn-primary btn-new" href="/invoices/new">Nueva factura</a>
		{/if}
	</div>
</div>

<section class="panel">
	<form class="filters" method="GET" data-sveltekit-keepfocus data-sveltekit-replacestate>
		<input type="hidden" name="status" value={data.status} />

		<div class="filters-control filters-control--date">
			<input type="date" name="dateFrom" value={data.dateFrom} aria-label="Desde" title="Desde" />
		</div>
		<div class="filters-control filters-control--date">
			<input type="date" name="dateTo" value={data.dateTo} aria-label="Hasta" title="Hasta" />
		</div>

		<button type="submit" class="filters-btn" aria-label="Buscar en el rango" title="Buscar en el rango">
			<Icon name="search" size={16} />
		</button>

		<div class="filters-search">
			<span class="filters-search-icon" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="15" height="15">
					<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
					<path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</span>
			<input
				type="search"
				name="search"
				value={data.search}
				placeholder="Número de factura o cliente"
				aria-label="Buscar en la tabla"
				oninput={alBuscar}
			/>
		</div>

		<button
			type="button"
			class="filters-btn filters-btn--sm"
			disabled={!data.search}
			onclick={() => irCon({ search: null })}
			aria-label="Limpiar la búsqueda"
			title="Limpiar la búsqueda"
		>
			<Icon name="x" size={14} />
		</button>
	</form>

	<p class="rango">
		{#if data.invertido}
			<span class="aviso">La fecha «Hasta» es anterior a la de «Desde».</span>
		{:else if data.dateFrom && data.dateTo}
			Facturas del {formatDateAbsolute(data.dateFrom)} al {formatDateAbsolute(data.dateTo)}
		{:else if data.dateFrom}
			Facturas desde el {formatDateAbsolute(data.dateFrom)}
		{:else if data.dateTo}
			Facturas hasta el {formatDateAbsolute(data.dateTo)}
		{:else}
			Todas las facturas
		{/if}
		· {data.invoices.length}
		{data.invoices.length === 1 ? 'resultado' : 'resultados'}
		{#if data.hayMas}<span class="aviso">— hay más de 100: acote las fechas.</span>{/if}
	</p>

	{#if data.invoices.length === 0}
		<p class="empty-state">Ninguna factura en este rango de fechas.</p>
	{:else}
		<div class="tabla-scroll">
			<table class="data-table data-table--acento">
				<thead>
					<tr>
						<th>Número</th>
						<th>Cliente</th>
						<th>Orden</th>
						<th>Fecha</th>
						<th class="num">Total</th>
						<th class="num">Saldo</th>
						<th>Estado</th>
					</tr>
				</thead>
				<tbody>
					{#each data.invoices as invoice (invoice.id)}
						{@const pendiente = saldo(invoice)}
						<tr>
							<td><a href="/invoices/{invoice.id}">{invoice.invoice_number}</a></td>
							<td>{invoice.client_name || '—'}</td>
							<td>
								{#if invoice.work_order_id}
									<a href="/work-orders/{invoice.work_order_id}">
										{invoice.order_number || `#${invoice.work_order_id}`}
									</a>
								{:else}
									—
								{/if}
							</td>
							<td>{formatDate(invoice.date)}</td>
							<td class="num">{formatMoney(invoice.total)}</td>
							<td class="num" class:saldado={pendiente === 0}>
								{#if pendiente === null}
									<span class="text-muted">—</span>
								{:else if pendiente === 0}
									Saldada
								{:else}
									{formatMoney(pendiente)}
								{/if}
							</td>
							<td>
								<span class="badge {statusBadgeClass(invoice.status)}">
									{statusLabel(invoice.status)}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

{#if buscando}
	<BuscarFactura onclose={() => (buscando = false)} />
{/if}

<style>
	.num {
		text-align: right;
		white-space: nowrap;
	}

	.saldado {
		color: var(--success-text);
	}

	.text-muted {
		color: var(--text-secondary);
	}

	.rango {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.aviso {
		color: var(--danger-text);
	}

	.tabla-scroll {
		overflow-x: auto;
	}
</style>
