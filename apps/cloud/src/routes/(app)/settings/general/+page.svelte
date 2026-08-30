<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const values = $derived(form?.values ?? { default_tax_rate: String(data.defaults.default_tax_rate) });
</script>

<section class="panel">
	<p class="panel-hint">
		Valores que la aplicación propone al trabajar. No son los datos que se imprimen: eso está en
		<a href="/settings/company">Datos de la empresa</a>.
	</p>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<form method="POST" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="default_tax_rate">Impuesto por defecto (%)</label>
			<!--
				`step="any"` y no `step="0.01"`: con un paso declarado, un valor que
				no sea múltiplo suyo da `stepMismatch` y el formulario NO envía, sin
				error ni aviso.
			-->
			<input
				id="default_tax_rate"
				name="default_tax_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				required
				value={values.default_tax_rate ?? '0'}
			/>
			<span class="field-hint">
				El ITBIS en República Dominicana es 18. Se propone en cada línea nueva de cotización y
				se puede cambiar en esa línea.
			</span>
		</div>
		<div class="form-actions">
			<button type="submit" class="btn-primary">Guardar cambios</button>
		</div>
	</form>

	<p class="panel-hint aviso">
		Cambiar este valor no toca ninguna cotización ya hecha.
	</p>
</section>

<style>
	.field-hint {
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.aviso {
		margin: var(--sp-4) 0 0;
	}
</style>
