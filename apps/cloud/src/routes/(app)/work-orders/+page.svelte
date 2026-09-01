<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import {
		PERIODOS,
		PERIODO_LABELS,
		formatDateAbsolute,
		formatMoney,
		rangoDelPeriodo,
		statusBadgeClass,
		statusLabel
	} from '@esr/core';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import BuscarOrden from './BuscarOrden.svelte';
	import { can } from '$lib/can';

	let { data } = $props();

	/* `parcialmente_devuelto` estaba fuera de la lista aunque es un estado real
	   del ciclo: una orden con parte del equipo de vuelta caía en «cualquiera» y
	   no se podía aislar. */
	const ESTADOS = [
		{ value: '', label: 'Cualquier estado' },
		{ value: 'confirmado', label: 'Confirmado' },
		{ value: 'en_preparacion', label: 'En preparación' },
		{ value: 'entregado', label: 'Entregado' },
		{ value: 'parcialmente_devuelto', label: 'Parcialmente devuelto' },
		{ value: 'devuelto', label: 'Devuelto' },
		{ value: 'cerrado', label: 'Cerrado' },
		{ value: 'cancelado', label: 'Cancelado' }
	];

	/**
	 * Navega conservando el resto de la query.
	 *
	 * El select ya no vive dentro de `FilterBar`, así que se queda sin su
	 * `<form method="GET">` y hay que navegar a mano. Mismo helper que usan
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

	/* Al teclear se espera; elegir un rango o un estado es una decisión cerrada
	   y va directa. Es el mismo trato que da `FilterBar`. */
	let temporizador = /** @type {any} */ (null);
	function alBuscar(/** @type {Event & { currentTarget: HTMLInputElement }} */ evento) {
		const valor = evento.currentTarget.value;
		clearTimeout(temporizador);
		temporizador = setTimeout(() => {
			const url = new URL(page.url);
			if (valor) url.searchParams.set('search', valor);
			else url.searchParams.delete('search');
			// `keepFocus`, o el cursor sale del input en cada tecla.
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

	/* El diálogo de buscar por número NO va en la URL, al contrario que el alta
	   de cotizaciones: es una ayuda de navegación de paso, y `?buscar=1` se
	   colaría en cada enlace compartido junto al rango de fechas. */
	let buscando = $state(false);
</script>

<!--
	Las herramientas van FUERA de la tarjeta y el contenido dentro: navegar la
	pantalla es un trabajo distinto de filtrar sus datos. Las clases viven en
	theme.css, compartidas con Cotizaciones y Eventos.
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
		<!-- Va en el grupo de navegación, no entre los filtros: no acota lo que se
		     ve, lleva a otra pantalla. -->
		<button
			type="button"
			class="grupo-btn"
			onclick={() => (buscando = true)}
			aria-label="Buscar una orden por su número"
			title="Buscar una orden por su número"
		>
			<Icon name="search" size={18} />
		</button>
	</div>

	<div class="herramientas-datos">
		<!-- Rango rápido: rellena las dos fechas Y aplica. Un botón es una decisión
		     cerrada, igual que un select; lo que exige pulsar «Buscar» es teclear
		     una fecha, que pasa por estados intermedios inválidos. -->
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
			label="Estado de la orden"
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ status: e.currentTarget.value })}
		/>
		{#if can('work_orders.create')}
			<a class="btn-primary btn-new" href="/work-orders/new">Nueva orden</a>
		{/if}
	</div>
</div>

<section class="panel">
	<!--
		Fila propia y no `FilterBar`: allí el orden es buscador → selects → fechas
		y las fechas se aplican SOLAS al cambiar. Aquí es el inverso y con botón, y
		meterlo allí serían tres banderas para un único llamador, con
		`/settings/audit` —el otro consumidor de `dates`— colgando de ellas. Lo que
		sí se conserva es lo valioso: las clases compartidas de theme.css y el
		`<form method="GET">`, que es lo que deja filtrar sin JavaScript.
	-->
	<form class="filters" method="GET" data-sveltekit-keepfocus data-sveltekit-replacestate>
		<!-- El estado vive FUERA de este form, en la barra de arriba. Un envío GET
		     serializa solo lo que hay dentro, así que sin este campo oculto pulsar
		     «Buscar» BORRARÍA el estado de la URL. -->
		<input type="hidden" name="status" value={data.status} />

		<div class="filters-control filters-control--date">
			<input type="date" name="dateFrom" value={data.dateFrom} aria-label="Desde" title="Desde" />
		</div>
		<div class="filters-control filters-control--date">
			<input type="date" name="dateTo" value={data.dateTo} aria-label="Hasta" title="Hasta" />
		</div>

		<!-- Submit NATIVO, sin `onclick`: SvelteKit intercepta los `<form
		     method="GET">` y los convierte en navegación de cliente. Eso da a la vez
		     el «aplicar solo al pulsar» y el filtrado sin JavaScript. -->
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
				placeholder="Número, cliente, evento o responsable"
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

	<!-- El rango se dice SIEMPRE, no solo cuando la tabla está vacía: el listado
	     abre con un filtro puesto que la URL no lleva, y callarlo hace que una
	     orden que no aparece parezca perdida. -->
	<p class="rango">
		{#if data.invertido}
			<span class="aviso">La fecha «Hasta» es anterior a la de «Desde».</span>
		{:else if data.dateFrom && data.dateTo}
			Órdenes del {formatDateAbsolute(data.dateFrom)} al {formatDateAbsolute(data.dateTo)}
		{:else if data.dateFrom}
			Órdenes desde el {formatDateAbsolute(data.dateFrom)}
		{:else if data.dateTo}
			Órdenes hasta el {formatDateAbsolute(data.dateTo)}
		{:else}
			Todas las órdenes
		{/if}
		· {data.orders.length}
		{data.orders.length === 1 ? 'resultado' : 'resultados'}
		{#if data.hayMas}<span class="aviso">— hay más de 100: acote las fechas.</span>{/if}
	</p>

	{#if data.orders.length === 0}
		<p class="empty-state">Ninguna orden en este rango de fechas.</p>
	{:else}
		<div class="tabla-scroll">
			<table class="data-table data-table--acento">
				<thead>
					<tr>
						<th>Número</th>
						<th>Cliente</th>
						<th>Evento</th>
						<th>Fecha</th>
						<th>Estado</th>
						<th class="num">Total</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.orders as order (order.id)}
						<tr>
							<td>{order.order_number || `#${order.id}`}</td>
							<td>{order.client_name}</td>
							<td>{order.event_name}</td>
							<!-- Absoluta y no relativa: en una lista de fechas de operación,
							     «hace 3 días» no sirve para lo que se está buscando. -->
							<td>{formatDateAbsolute(order.date)}</td>
							<td>
								<span class="badge {statusBadgeClass(order.status)}">{statusLabel(order.status)}</span>
							</td>
							<td class="num">{formatMoney(order.total)}</td>
							<td><a class="btn-view" href="/work-orders/{order.id}">Ver</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

{#if buscando}
	<BuscarOrden onclose={() => (buscando = false)} />
{/if}

<style>
	.num {
		text-align: right;
		white-space: nowrap;
	}

	.rango {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.aviso {
		color: var(--danger-text);
	}

	/* Siete columnas no caben en un teléfono: que scrollee la tabla, no la
	   página. */
	.tabla-scroll {
		overflow-x: auto;
	}
</style>
