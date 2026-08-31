<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatDate, formatMoney, formatNumber, formatRelativeTime, statusBadgeClass, statusLabel } from '@esr/core';
	import { EmptyState } from '@esr/ui';

	let { data } = $props();

	/**
	 * Franja de seis. Solo el inventario es un STOCK —articulos que hay ahora—,
	 * asi que lleva su propia nota para que no se lea bajo el periodo elegido.
	 */
	const metricas = $derived([
		{ key: 'newCustomers', label: 'Clientes nuevos', value: data.stats.newCustomers },
		{ key: 'inventory', label: 'Artículos en inventario', value: data.stats.inventory, nota: 'al día de hoy' },
		{ key: 'events', label: 'Eventos', value: data.stats.events },
		{ key: 'openQuotes', label: 'Cotizaciones abiertas', value: data.stats.openQuotes },
		{ key: 'activeOrders', label: 'Órdenes activas', value: data.stats.activeOrders },
		{ key: 'openIncidents', label: 'Incidencias abiertas', value: data.stats.openIncidents }
	]);

	/**
	 * `generadoEn` es el sello del servidor. Se copia a estado y se refresca cada
	 * minuto para que «hace 4 minutos» siga siendo cierto sin recargar.
	 */
	let ahora = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (ahora = new Date()), 60_000);
		return () => clearInterval(id);
	});
	const actualizado = $derived(formatRelativeTime(data.generadoEn, ahora));

	function cambiarPeriodo(event) {
		const url = new URL(page.url);
		url.searchParams.set('dias', event.currentTarget.value);
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}
</script>

<div class="dashboard">
	<header class="dashboard-cabecera">
		<p class="dashboard-sello">Actualizado {actualizado}</p>
		<label class="dashboard-periodo">
			<span class="visually-hidden">Periodo</span>
			<select value={String(data.dias)} onchange={cambiarPeriodo}>
				{#each data.periodos as dias (dias)}
					<option value={String(dias)}>Últimos {dias} días</option>
				{/each}
			</select>
		</label>
	</header>

	<!-- Franja unica dividida por hairlines, no seis tarjetas: seis cifras de un
	     digito no necesitan seis cajas con sombra compitiendo con el contenido. -->
	<section class="franja" aria-label="Métricas">
		{#each metricas as metrica (metrica.key)}
			<article class="metrica">
				<span class="metrica-label">{metrica.label}</span>
				<strong class="metrica-valor">{formatNumber(metrica.value)}</strong>
				{#if metrica.nota}
					<span class="metrica-nota">{metrica.nota}</span>
				{/if}
			</article>
		{/each}
	</section>

	<section class="paneles">
		<article class="panel-card">
			<div class="panel-card-header">
				<h2>Próximos eventos</h2>
				<a class="ver-todos" href="/events">Ver todos</a>
			</div>
			{#if data.upcomingEvents.length === 0}
				<EmptyState
					icon="calendar"
					title="Sin eventos programados"
					description="Agenda el primero para verlo aquí."
					actionLabel="Crear evento"
					actionHref="/events?nueva=1"
				/>
			{:else}
				<ul class="lineas">
					{#each data.upcomingEvents as event (event.id)}
						<li>
							<a href="/events/{event.id}">
								<span class="linea-titulo">{event.name}</span>
								<span class="linea-meta">{formatDate(event.date)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>

		<article class="panel-card">
			<div class="panel-card-header">
				<h2>Cotizaciones recientes</h2>
				<a class="ver-todos" href="/quotes">Ver todas</a>
			</div>
			{#if data.recentQuotes.length === 0}
				<EmptyState
					icon="document"
					title="Sin cotizaciones"
					description="Prepara una propuesta y aparecerá aquí."
					actionLabel="Nueva cotización"
					actionHref="/quotes?nueva=1"
				/>
			{:else}
				<ul class="lineas">
					{#each data.recentQuotes as quote (quote.id)}
						<li>
							<a href="/quotes/{quote.id}">
								<span class="linea-principal">
									<span class="linea-titulo linea-mono">{quote.quote_number || `COT #${quote.id}`}</span>
									<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
								</span>
								<span class="linea-importe">{formatMoney(quote.total)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>
	</section>

	<!-- El tercer panel va a ancho completo: en una rejilla de dos columnas se
	     quedaria huerfano en la segunda fila. -->
	<section class="panel-ancho">
		<article class="panel-card">
			<div class="panel-card-header">
				<h2>Órdenes activas</h2>
				<a class="ver-todos" href="/work-orders">Ver todas</a>
			</div>
			{#if data.activeOrders.length === 0}
				<EmptyState
					icon="box"
					title="Sin órdenes en flujo"
					description="Convierte una cotización aprobada para empezar."
					actionLabel="Ver cotizaciones"
					actionHref="/quotes?status=aprobada"
				/>
			{:else}
				<ul class="lineas lineas-anchas">
					{#each data.activeOrders as order (order.id)}
						<li>
							<a href="/work-orders/{order.id}">
								<span class="linea-principal">
									<span class="linea-titulo linea-mono">{order.order_number || `ORD #${order.id}`}</span>
									<span class="badge {statusBadgeClass(order.status)}">{statusLabel(order.status)}</span>
								</span>
								<span class="linea-meta">{formatDate(order.date)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>
	</section>
</div>

<style>
	/* Casi todo el vocabulario de esta pantalla —`.dashboard`, `.franja`,
	   `.metrica*`, `.panel-card*`, `.lineas*`, `.ver-todos`— vive ahora en
	   @esr/config/theme.css, porque ESR Pro enseña la misma portada. Aquí solo
	   queda lo que de verdad es local.

	   OJO con borrar de aquí: un `<style>` de componente va SIN capa y gana
	   siempre a la hoja compartida, así que mientras estas reglas estuvieran
	   duplicadas la promoción no tenía ningún efecto. */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
