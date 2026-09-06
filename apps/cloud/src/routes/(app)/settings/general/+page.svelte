<script>
	import { enhance } from '$app/forms';
	import { PERIODOS, PERIODO_LABELS } from '@esr/core';
	import { dangerModal } from '$lib/stores/dangerModal';
	import { toasts } from '$lib/stores/toasts';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
		if (form?.success) toasts.success(form.success);
	});

	const values = $derived(
		form?.values ?? {
			default_tax_rate: String(data.defaults.default_tax_rate),
			default_valuation_rule: data.defaults.default_valuation_rule,
			default_order_range: data.defaults.default_order_range,
			default_quote_range: data.defaults.default_quote_range,
			default_invoice_range: data.defaults.default_invoice_range,
			default_event_range: data.defaults.default_event_range
		}
	);
</script>

<section class="panel">
	<p class="panel-hint">
		Valores que la aplicación propone al trabajar. No son los datos que se imprimen: eso está en
		<a href="/settings/company">Datos de la empresa</a>.
	</p>

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
		<div class="form-field">
			<label for="default_order_range">Órdenes que se cargan</label>
			<select id="default_order_range" name="default_order_range">
				{#each PERIODOS as periodo (periodo)}
					<option value={periodo} selected={values.default_order_range === periodo}>
						{PERIODO_LABELS[periodo]} en curso
					</option>
				{/each}
			</select>
			<span class="field-hint">
				La ventana de fechas con la que abre el listado de órdenes. Se puede cambiar en la
				propia pantalla, y para ver más de un año se teclean las fechas a mano.
			</span>
		</div>
		<div class="form-field">
			<label for="default_quote_range">Cotizaciones que se cargan</label>
			<select id="default_quote_range" name="default_quote_range">
				{#each PERIODOS as periodo (periodo)}
					<option value={periodo} selected={values.default_quote_range === periodo}>
						{PERIODO_LABELS[periodo]} en curso
					</option>
				{/each}
			</select>
			<span class="field-hint">
				La ventana de fechas con la que abre el listado de cotizaciones. Ajuste aparte del de
				órdenes: una empresa puede querer una ventana distinta para cada una.
			</span>
		</div>
		<div class="form-field">
			<label for="default_invoice_range">Facturas que se cargan</label>
			<select id="default_invoice_range" name="default_invoice_range">
				{#each PERIODOS as periodo (periodo)}
					<option value={periodo} selected={values.default_invoice_range === periodo}>
						{PERIODO_LABELS[periodo]} en curso
					</option>
				{/each}
			</select>
			<span class="field-hint">
				La ventana de fechas con la que abre el listado de facturas. Ajuste aparte de las
				anteriores: una empresa puede querer una ventana distinta para cada listado.
			</span>
		</div>
		<div class="form-field">
			<label for="default_event_range">Eventos que se cargan</label>
			<select id="default_event_range" name="default_event_range">
				{#each PERIODOS as periodo (periodo)}
					<option value={periodo} selected={values.default_event_range === periodo}>
						{PERIODO_LABELS[periodo]} en curso
					</option>
				{/each}
			</select>
			<span class="field-hint">
				La ventana de fechas con la que abre la Tabla del listado de eventos. El Calendario no
				usa este ajuste: siempre carga todos los eventos activos.
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
