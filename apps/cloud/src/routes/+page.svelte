<script>
	import { cloudAppConfig } from '@esr/config';
</script>

<section class="panel">
	<p class="eyebrow">Preparado para navegador y multiusuario</p>
	<h1>ESR Cloud</h1>
	<p>
		Base inicial para la futura version web de ESR: SvelteKit, paquetes compartidos y
		preparacion para PostgreSQL sin conectar base de datos todavia.
	</p>

	<div class="grid">
		<div class="metric">
			<strong>{cloudAppConfig.databaseTarget}</strong>
			<span>Base objetivo futura</span>
		</div>
		<div class="metric">
			<strong>{cloudAppConfig.authMode}</strong>
			<span>Modo de autenticacion previsto</span>
		</div>
		<div class="metric">
			<strong>{cloudAppConfig.backupStrategy}</strong>
			<span>Estrategia de respaldo prevista</span>
		</div>
	</div>
</section>

