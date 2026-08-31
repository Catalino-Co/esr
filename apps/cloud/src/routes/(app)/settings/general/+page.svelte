<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const values = $derived(
		form?.values ?? {
			default_tax_rate: String(data.defaults.default_tax_rate),
			default_valuation_rule: data.defaults.default_valuation_rule
		}
	);
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
		<div class="form-field">
			<label for="default_valuation_rule">Valoración del inventario</label>
			<select id="default_valuation_rule" name="default_valuation_rule">
				<option value="ultimo" selected={values.default_valuation_rule !== 'promedio3'}>
					Último precio de compra
				</option>
				<option value="promedio3" selected={values.default_valuation_rule === 'promedio3'}>
					Promedio de las 3 últimas compras
				</option>
			</select>
			<span class="field-hint">
				Con qué costo se valora lo que hay en el almacén. El costo sale de las entradas
				registradas; las que se hicieron sin costo no cuentan.
			</span>
		</div>
		<div class="form-actions">
			<button type="submit" class="btn-primary">Guardar cambios</button>
		</div>
	</form>

	<p class="panel-hint aviso">
		Cambiar estos valores no toca ninguna cotización ya hecha ni ningún costo ya registrado.
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
