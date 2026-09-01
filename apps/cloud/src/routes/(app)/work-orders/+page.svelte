<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import { formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
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
	 */
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
	</div>

	<div class="herramientas-datos">
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
	<!-- Solo el buscador: sin selects al lado, su `flex: 1 1 auto` le da la fila
	     entera. Se queda dentro de `FilterBar` para conservar el retardo al
	     teclear y el filtrado sin JavaScript. -->
	<FilterBar search={{ name: 'search', placeholder: 'Cliente o responsable', value: data.search }} />

	{#if data.orders.length === 0}
		<p class="empty-state">No hay órdenes.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Número</th>
					<th>Cliente</th>
					<th>Evento</th>
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
						<td>
							<span class="badge {statusBadgeClass(order.status)}">{statusLabel(order.status)}</span>
						</td>
						<td class="num">{formatMoney(order.total)}</td>
						<td><a class="btn-view" href="/work-orders/{order.id}">Ver</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.num {
		text-align: right;
		white-space: nowrap;
	}
</style>
