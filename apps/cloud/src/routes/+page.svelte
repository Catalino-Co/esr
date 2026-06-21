<script>
	import { cloudAppConfig } from '@esr/config';
</script>

<div class="cloud-shell">
	<header class="cloud-topbar">
		<div class="cloud-topbar-inner">
			<a class="brand" href="/">ESR Cloud</a>
			<nav class="nav" aria-label="Principal">
				<a href="/login">Iniciar sesión</a>
				<a href="/ui-test">UI test</a>
				<a href="/schema-test">Schema test</a>
			</nav>
		</div>
	</header>

	<main class="cloud-main">
		<section class="panel">
			<p class="eyebrow">Preparado para navegador y multiusuario</p>
			<h1>ESR Cloud</h1>
			<p>
				Versión web de ESR con autenticación, sesiones persistentes y modelo multiempresa.
				Inicie sesión para acceder al dashboard.
			</p>

			<div class="grid">
				<div class="metric">
					<strong>{cloudAppConfig.databaseTarget}</strong>
					<span>Base de datos</span>
				</div>
				<div class="metric">
					<strong>{cloudAppConfig.authMode}</strong>
					<span>Autenticación</span>
				</div>
				<div class="metric">
					<strong>{cloudAppConfig.backupStrategy}</strong>
					<span>Respaldo</span>
				</div>
			</div>

			<p class="cta">
				<a class="btn-primary" href="/login">Ir al login</a>
			</p>
		</section>
	</main>
</div>

<style>
	.cta {
		margin-top: 24px;
	}

	.btn-primary {
		display: inline-block;
		background: var(--primary);
		color: white;
		padding: 12px 18px;
		border-radius: 6px;
		font-weight: 600;
	}

	.btn-primary:hover {
		background: var(--primary-strong);
	}
</style>
