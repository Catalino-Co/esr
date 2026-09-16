<script>
	import { ICONS } from '@esr/ui/icons';

	const reports = [
		{ href: '/reports/inventory', title: 'Inventario disponible', description: 'Stock total, disponible y comprometido por artículo.', ready: true },
		{ href: '/reports/catalog', title: 'Catálogo de productos', description: 'Lista de precios por categoría y subcategoría, para clientes.', ready: true },
		{ href: '/reports/orders', title: 'Órdenes activas', description: 'Estado, fechas y totales de las órdenes.', ready: true },
		{ href: '/reports/incidents', title: 'Incidencias abiertas', description: 'Seguimiento de incidencias operativas.', ready: true },
		{ href: '/reports/events', title: 'Eventos por fecha', description: 'Calendario y reservas por periodo.', ready: true },
		{ href: '/reports/quotes', title: 'Cotizaciones por estado', description: 'Pipeline comercial y conversiones.', ready: false },
		{ href: '/reports/delivery-notes', title: 'Conduces emitidos', description: 'Entregas y devoluciones registradas.', ready: false },
		{ href: '/reports/customers', title: 'Clientes registrados', description: 'Directorio y actividad de clientes.', ready: false }
	];
</script>

<p class="page-intro">Consultas operativas básicas filtradas por su empresa activa.</p>

<div class="report-grid">
	{#each reports as report (report.href)}
		{#if report.ready}
			<a class="report-card" href={report.href}>
				<span class="report-card-icon" aria-hidden="true">{ICONS.reports}</span>
				<span class="report-card-text">
					<strong>{report.title}</strong>
					<span class="report-card-desc">{report.description}</span>
					<span class="report-link">Ver reporte →</span>
				</span>
			</a>
		{:else}
			<div class="report-card report-card--soon">
				<span class="report-card-icon" aria-hidden="true">{ICONS.reports}</span>
				<span class="report-card-text">
					<strong>{report.title}</strong>
					<span class="report-card-desc">{report.description}</span>
					<span class="badge">Próximamente</span>
				</span>
			</div>
		{/if}
	{/each}
</div>

<style>
	.page-intro {
		color: var(--text-muted);
		margin: 0 0 var(--sp-4);
	}

	/* Calcado de `.settings-cards`/`.settings-card` en settings/+page.svelte:
	   tarjetas sueltas sobre el fondo de la pagina, no dentro de un `.panel`. */
	.report-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--sp-4);
	}

	.report-card {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		text-decoration: none;
		color: inherit;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.report-card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-md);
	}

	.report-card:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: var(--focus-ring);
	}

	.report-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: var(--radius);
		background: var(--accent-subtle);
		font-size: 1.15rem;
		line-height: 1;
	}

	.report-card-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.report-card-text strong {
		font-size: var(--font-md);
		color: var(--text-primary);
	}

	.report-card-desc {
		font-size: var(--font-sm);
		color: var(--text-muted);
		line-height: 1.5;
	}

	.report-link {
		margin-top: 4px;
		color: var(--text-brand);
		font-size: var(--font-sm);
		font-weight: 600;
	}

	.report-card--soon {
		opacity: 0.75;
		cursor: default;
	}
</style>
