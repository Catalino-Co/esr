<script>
	let { data } = $props();
</script>

<section class="panel">
	<p class="eyebrow">Área privada</p>
	<h1>ESR Cloud Dashboard</h1>
	<p>Gestión operativa filtrada por empresa activa.</p>

	<div class="grid">
		<div class="metric">
			<strong>{data.user.name}</strong>
			<span>Usuario actual</span>
		</div>
		<div class="metric">
			<strong>{data.company.name}</strong>
			<span>Empresa activa</span>
		</div>
		<div class="metric">
			<strong>{data.role ?? '—'}</strong>
			<span>Rol</span>
		</div>
	</div>

	<div class="page-actions" style="margin-top: 24px">
		<a class="btn-primary" href="/customers">Clientes</a>
		<a class="btn-primary" href="/inventory">Inventario</a>
		<a class="btn-primary" href="/events">Eventos</a>
		<a class="btn-primary" href="/quotes">Cotizaciones</a>
		<a class="btn-primary" href="/work-orders">Órdenes</a>
	</div>
</section>
