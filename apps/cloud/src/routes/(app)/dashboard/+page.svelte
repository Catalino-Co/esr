<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatDate, formatMoney, formatNumber, formatRelativeTime, statusBadgeClass, statusLabel } from '@esr/core';
	import EmptyState from '$lib/components/EmptyState.svelte';

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
	<header class="cabecera">
		<p class="sello">Actualizado {actualizado}</p>
		<label class="periodo">
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
					actionHref="/events/new"
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
					actionHref="/quotes/new"
				/>
			{:else}
				<ul class="lineas">
					{#each data.recentQuotes as quote (quote.id)}
						<li>
							<a href="/quotes/{quote.id}">
								<span class="linea-principal">
									<span class="linea-titulo mono">{quote.quote_number || `COT #${quote.id}`}</span>
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
									<span class="linea-titulo mono">{order.order_number || `ORD #${order.id}`}</span>
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
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.cabecera {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	/* --text-secondary y no --text-muted: la cabecera va sobre --surface-page,
	   no sobre blanco, y ahi el gris apagado se queda en 4.47:1. */
	.sello {
		margin: 0;
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.periodo select {
		height: var(--h-control);
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-primary);
		font-size: var(--font-sm);
	}

	.periodo select:focus-visible {
		outline: none;
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	/* Una sola caja partida por hairlines. El truco es el `gap: 1px` sobre el
	   color de borde: cada celda pinta su propio fondo y la rejilla deja ver el
	   borde por las juntas, sin dibujar ni una linea. */
	.franja {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.metrica {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-4) var(--sp-5);
		background: var(--surface);
	}

	/* Sentence case y sin letter-spacing: la `.stat-label` compartida lleva
	   `text-transform: uppercase`, que el sistema de diseño prohíbe. */
	.metrica-label {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	.metrica-valor {
		font-size: 1.375rem;
		font-weight: 500;
		line-height: 1.2;
		color: var(--text-primary);
	}

	/* Es texto que hay que LEER —dice que esta cifra no sigue al periodo—, asi
	   que no puede ir en --text-placeholder: 2.56:1. La regla del sistema es
	   que ese token solo vale para placeholders e iconos decorativos. */
	.metrica-nota {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	.paneles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
		align-items: stretch;
	}

	.panel-card {
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
	}

	.panel-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.panel-card-header h2 {
		margin: 0;
		font-size: var(--font-md);
		color: var(--text-primary);
	}

	/* Gris en reposo: tres enlaces en color de acento tiran del ojo hacia la
	   cabecera, que es justo donde no está el contenido. */
	.ver-todos {
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.ver-todos:hover {
		color: var(--text-brand);
	}

	.lineas {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.lineas li + li {
		border-top: 1px solid var(--border);
	}

	.lineas a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3) 0;
	}

	.lineas a:hover .linea-titulo {
		color: var(--text-brand);
	}

	.linea-principal {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}

	.linea-titulo {
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mono {
		font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Menlo, monospace;
		font-weight: 500;
	}

	.linea-meta {
		font-size: var(--font-sm);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.linea-importe {
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (max-width: 900px) {
		.franja {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.paneles {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 560px) {
		.franja {
			grid-template-columns: 1fr;
		}
	}
</style>
