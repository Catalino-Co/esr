<script>
	import { ICONS } from '@esr/ui/icons';

	let { data } = $props();

	const statCards = [
		{
			key: 'customers',
			label: 'Clientes',
			value: data.stats.customers,
			hint: 'Registrados en la empresa activa',
			accent: 'blue',
			icon: ICONS.customers
		},
		{
			key: 'inventory',
			label: 'Inventario',
			value: data.stats.inventory,
			hint: 'Artículos activos',
			accent: 'indigo',
			icon: ICONS.inventory
		},
		{
			key: 'events',
			label: 'Eventos',
			value: data.stats.events,
			hint: 'Eventos en el sistema',
			accent: 'cyan',
			icon: ICONS.events
		},
		{
			key: 'openQuotes',
			label: 'Cotizaciones abiertas',
			value: data.stats.openQuotes,
			hint: 'Borrador o aprobadas',
			accent: 'amber',
			icon: ICONS.quotes
		},
		{
			key: 'activeOrders',
			label: 'Órdenes activas',
			value: data.stats.activeOrders,
			hint: 'En flujo operativo',
			accent: 'violet',
			icon: ICONS.workOrders
		},
		{
			key: 'openIncidents',
			label: 'Incidencias abiertas',
			value: data.stats.openIncidents,
			hint: 'Pendientes de resolución',
			accent: 'rose',
			icon: ICONS.incidents
		}
	];
</script>

<div class="dashboard">
	<section class="stat-grid">
		{#each statCards as card (card.key)}
			<article class="stat-card accent-{card.accent}">
				<div class="stat-card-top">
					<span class="stat-icon" aria-hidden="true">{card.icon}</span>
					<span class="stat-label">{card.label}</span>
				</div>
				<strong class="stat-value">{card.value}</strong>
				<p class="stat-hint">{card.hint}</p>
			</article>
		{/each}
	</section>

	<section class="dashboard-grid">
		<article class="panel-card">
			<div class="panel-card-header">
				<h3>Próximos eventos</h3>
				<a href="/events">Ver todos</a>
			</div>
			{#if data.upcomingEvents.length === 0}
				<p class="empty-inline">No hay eventos próximos.</p>
			{:else}
				<ul class="list-lines">
					{#each data.upcomingEvents as event (event.id)}
						<li>
							<a href="/events/{event.id}">
								<strong>{event.name}</strong>
								<span>{event.date ?? '—'}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>

		<article class="panel-card">
			<div class="panel-card-header">
				<h3>Cotizaciones recientes</h3>
				<a href="/quotes">Ver todas</a>
			</div>
			{#if data.recentQuotes.length === 0}
				<p class="empty-inline">Sin cotizaciones recientes.</p>
			{:else}
				<ul class="list-lines">
					{#each data.recentQuotes as quote (quote.id)}
						<li>
							<a href="/quotes/{quote.id}">
								<strong>{quote.quote_number || `COT #${quote.id}`}</strong>
								<span>{quote.status} · {Number(quote.total || 0).toFixed(2)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>

		<article class="panel-card">
			<div class="panel-card-header">
				<h3>Órdenes activas</h3>
				<a href="/work-orders">Ver todas</a>
			</div>
			{#if data.activeOrders.length === 0}
				<p class="empty-inline">No hay órdenes activas.</p>
			{:else}
				<ul class="list-lines">
					{#each data.activeOrders as order (order.id)}
						<li>
							<a href="/work-orders/{order.id}">
								<strong>{order.order_number || `ORD #${order.id}`}</strong>
								<span>{order.status} · {order.date ?? '—'}</span>
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
		gap: 24px;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.stat-card {
		background: var(--cloud-surface);
		border: 1px solid var(--cloud-border);
		border-radius: 12px;
		padding: 18px;
		box-shadow: var(--cloud-shadow-sm);
	}

	.stat-card-top {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}

	.stat-icon {
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		font-size: 0.85rem;
	}

	.stat-label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--cloud-muted);
	}

	.stat-value {
		display: block;
		font-size: 1.85rem;
		line-height: 1.1;
		color: var(--cloud-text);
		margin-bottom: 6px;
	}

	.stat-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--cloud-muted);
	}

	.accent-blue .stat-icon { background: var(--accent-subtle); color: var(--accent); }
	.accent-indigo .stat-icon { background: #eef2ff; color: #4f46e5; }
	.accent-cyan .stat-icon { background: #ecfeff; color: #0891b2; }
	.accent-amber .stat-icon { background: #fffbeb; color: #d97706; }
	.accent-violet .stat-icon { background: #f5f3ff; color: #7c3aed; }
	.accent-rose .stat-icon { background: #fff1f2; color: #e11d48; }

	.dashboard-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.panel-card {
		background: var(--cloud-surface);
		border: 1px solid var(--cloud-border);
		border-radius: 12px;
		padding: 18px;
		box-shadow: var(--cloud-shadow-sm);
	}

	.panel-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}

	.panel-card-header h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--cloud-text);
	}

	.panel-card-header a {
		font-size: 0.82rem;
		font-weight: 600;
		/* --text-brand y no --cloud-primary: el primero aclara en tema
		   oscuro; el segundo es el azul de marca fijo y se pierde sobre
		   la superficie oscura. */
		color: var(--text-brand);
	}

	.list-lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.list-lines a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid transparent;
	}

	.list-lines a:hover {
		background: var(--cloud-bg);
		border-color: var(--cloud-border);
	}

	.list-lines strong {
		font-size: 0.9rem;
		color: var(--cloud-text);
	}

	.list-lines span {
		font-size: 0.78rem;
		color: var(--cloud-muted);
		white-space: nowrap;
	}

	.empty-inline {
		margin: 0;
		padding: 12px 0;
		color: var(--cloud-muted);
		font-size: 0.88rem;
	}

	@media (max-width: 900px) {
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
