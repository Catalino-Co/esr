<script>
	import { Badge, Button, Card, EmptyState } from '@esr/ui';
</script>

<section class="panel">
	<p class="eyebrow">Componente compartido</p>
	<h1>Prueba de UI compartida</h1>
	<p>Esta pantalla consume componentes desde <code>@esr/ui</code>.</p>

	<div class="grid">
		<Card>
			<h2>Estado del paquete</h2>
			<Badge variant="success">Disponible</Badge>
			<p>Este bloque confirma que ESR Cloud puede renderizar componentes compartidos.</p>
			<Button type="button">Accion de prueba</Button>
		</Card>

		<Card>
			<EmptyState
				message="ESR Cloud todavia no conecta PostgreSQL; esta vista solo valida la base visual."
			/>
		</Card>
	</div>
</section>
