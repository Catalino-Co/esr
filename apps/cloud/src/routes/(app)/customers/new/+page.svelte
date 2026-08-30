<script>
	import { enhance } from '$app/forms';
	import CustomerAddressBook from '$lib/components/customers/CustomerAddressBook.svelte';
	import CustomerFormFields from '$lib/components/customers/CustomerFormFields.svelte';

	let { data, form } = $props();

	const values = $derived(form?.values ?? {});
	const sectors = $derived(data.sectors ?? []);

	/**
	 * `reset: false` no es un detalle: `update()` resetea el `<form>`, y un reset
	 * devuelve cada input a su `defaultValue` —el atributo HTML—, que Svelte
	 * nunca escribe porque asigna `value` como PROPIEDAD. El formulario se
	 * vaciaba al guardar. Y no se repone solo en el re-render: como los valores
	 * del servidor son los mismos que antes de enviar, Svelte no ve cambio y no
	 * toca el DOM.
	 */
	const alGuardar = () => async ({ update }) => update({ reset: false });
</script>

<div class="record-header">
	<h1>Nuevo cliente</h1>
</div>

<div class="client-layout">
	<section class="panel">
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}

		<form method="POST" use:enhance={alGuardar}>
			<CustomerFormFields {values} {sectors} fieldErrors={form?.fieldErrors ?? null} />

			<div class="form-actions">
				<a class="btn-secondary back-link" href="/customers">Volver al listado</a>
				<button type="submit" class="btn-primary">Crear cliente</button>
			</div>
		</form>
	</section>

	<!-- Deshabilitada, no ausente: el cliente todavia no existe y no puede
	     tener filas, pero si la tarjeta desapareciera la pantalla cambiaria de
	     forma entre crear y editar. Al guardar se cae en la ficha, que es donde
	     se agregan. -->
	<CustomerAddressBook
		disabled
		disabledHint="Guarda el cliente para agregar sus direcciones de servicio."
	/>
</div>

<style>
	/* Cabecera propia y no `.page-header`: esa clase lleva un
	   `> :first-child:last-child { margin-left: auto }` para los listados, que
	   solo tienen el boton de alta. Aqui el unico hijo es el titulo, y ese
	   margen lo mandaba al borde derecho. */
	.record-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-5);
	}

	.record-header h1 {
		margin: 0;
		font-size: 1.6rem;
	}

	.client-layout {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
		align-items: start;
	}

	@media (max-width: 1100px) {
		.client-layout {
			grid-template-columns: 1fr;
		}
	}

	.back-link {
		margin-right: auto;
	}
</style>
