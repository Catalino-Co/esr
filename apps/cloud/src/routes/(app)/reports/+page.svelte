<script>
	const reports = [
		{ href: '/reports/inventory', title: 'Inventario disponible', description: 'Stock total, disponible y comprometido por artículo.', ready: true },
		{ href: '/reports/orders', title: 'Órdenes activas', description: 'Estado, fechas y totales de las órdenes.', ready: true },
		{ href: '/reports/incidents', title: 'Incidencias abiertas', description: 'Seguimiento de incidencias operativas.', ready: true },
		{ href: '/reports/events', title: 'Eventos por fecha', description: 'Calendario y reservas por periodo.', ready: false },
		{ href: '/reports/quotes', title: 'Cotizaciones por estado', description: 'Pipeline comercial y conversiones.', ready: false },
		{ href: '/reports/delivery-notes', title: 'Conduces emitidos', description: 'Entregas y devoluciones registradas.', ready: false },
		{ href: '/reports/customers', title: 'Clientes registrados', description: 'Directorio y actividad de clientes.', ready: false }
	];
</script>

<section class="panel">
	<p class="page-intro">Consultas operativas básicas filtradas por su empresa activa.</p>

	<div class="report-grid">
		{#each reports as report (report.href)}
			{#if report.ready}
				<a class="report-card" href={report.href}>
					<h2>{report.title}</h2>
					<p>{report.description}</p>
					<span class="report-link">Ver reporte →</span>
				</a>
			{:else}
				<div class="report-card report-card--soon">
					<h2>{report.title}</h2>
					<p>{report.description}</p>
					<span class="badge">Próximamente</span>
				</div>
			{/if}
		{/each}
	</div>
</section>

<style>
	.page-intro {
		color: var(--muted);
		margin: 0 0 24px;
	}
	.report-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
	}
	.report-card {
		display: block;
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.report-card:hover {
		border-color: var(--primary);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
	}
	.report-card h2 {
		margin: 0 0 8px;
		font-size: 1.05rem;
	}
	.report-card p {
		margin: 0 0 12px;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.45;
	}
	.report-link {
		/* --text-brand, no --primary: el acento como letra da 3.27:1 en oscuro. */
		color: var(--text-brand);
		font-size: 0.9rem;
		font-weight: 600;
	}
	.report-card--soon {
		opacity: 0.75;
		cursor: default;
	}
</style>
