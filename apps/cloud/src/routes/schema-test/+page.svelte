<script>
	import { validateCustomerInput } from '@esr/schemas';

	const validCustomer = validateCustomerInput({ name: 'Cliente Demo Cloud' });
	const invalidCustomer = validateCustomerInput({ name: '' });
</script>

<section class="panel">
	<p class="eyebrow">Schema compartido</p>
	<h1>Prueba de schemas</h1>
	<p>Esta pantalla usa validaciones desde <code>@esr/schemas</code>.</p>

	<div class="grid">
		<div class="metric">
			<strong>{validCustomer.valid ? 'Valido' : 'Invalido'}</strong>
			<span>Cliente con nombre</span>
		</div>
		<div class="metric">
			<strong>{invalidCustomer.valid ? 'Valido' : 'Invalido'}</strong>
			<span>{invalidCustomer.issues?.[0] || 'Sin errores'}</span>
		</div>
	</div>
</section>

