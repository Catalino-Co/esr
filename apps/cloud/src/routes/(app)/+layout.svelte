<script>
	let { data, children } = $props();
</script>

<div class="cloud-shell">
	<header class="cloud-topbar">
		<div class="cloud-topbar-inner">
			<a class="brand" href="/dashboard">ESR Cloud</a>
			<nav class="nav" aria-label="Principal">
				<a href="/dashboard">Dashboard</a>
				<a href="/customers">Clientes</a>
				<a href="/inventory">Inventario</a>
				<a href="/events">Eventos</a>
				<a href="/quotes">Cotizaciones</a>
				<a href="/work-orders">Órdenes</a>
				<a href="/conduces">Conduces</a>
				<a href="/incidents">Incidencias</a>
				<span class="user-meta">{data.user.name} · {data.company.name} · {data.role ?? '—'}</span>
				<form method="POST" action="/logout">
					<button type="submit" class="btn-link">Cerrar sesión</button>
				</form>
			</nav>
		</div>
	</header>

	<main class="cloud-main">
		{@render children()}
	</main>
</div>

<style>
	.user-meta {
		color: var(--text-muted);
		font-size: 0.88rem;
		padding: 0 6px;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		padding: 8px 10px;
		border-radius: 6px;
		font-size: 0.92rem;
	}

	.btn-link:hover {
		background: #eef2fb;
	}
</style>
