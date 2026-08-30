<script>
	import { enhance } from '$app/forms';
	import { recordStateBadgeClass, recordStateLabel } from '@esr/core';
	import CustomerAddressBook from '$lib/components/customers/CustomerAddressBook.svelte';
	import CustomerFormFields from '$lib/components/customers/CustomerFormFields.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	// `$derived` y no una desestructuracion: navegar de un cliente a otro
	// reutiliza el componente, y un `const` se quedaria con el anterior.
	const customer = $derived(data.customer);
	const addresses = $derived(data.addresses ?? []);
	const addressTypes = $derived(data.addressTypes ?? []);
	const sectors = $derived(data.sectors ?? []);

	// El mensaje del cliente y el de las direcciones comparten el objeto `form`:
	// el `scope` decide sobre cual de las dos tarjetas se pinta.
	const mensaje = $derived(form?.scope === 'customer' ? form : null);

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
	<h1>{customer.name}</h1>
	<span class="badge {recordStateBadgeClass(customer.is_active)}">
		{recordStateLabel(customer.is_active)}
	</span>
</div>

<div class="client-layout">
	<section class="panel">
		{#if mensaje?.success}
			<div class="alert-success" role="status">{mensaje.success}</div>
		{/if}
		{#if mensaje?.error}
			<div class="alert-error" role="alert">{mensaje.error}</div>
		{/if}

		<form method="POST" action="?/update" use:enhance={alGuardar}>
			<CustomerFormFields
				values={customer}
				{sectors}
				fieldErrors={mensaje?.fieldErrors ?? null}
				showState={can('customers.archive')}
			/>

			<div class="form-actions">
				<!-- «Volver al listado» va aqui, al pie y a la izquierda. El
				     `margin-right: auto` es local: `.form-actions` es compartida
				     y sigue alineando a la derecha en todas las demas pantallas. -->
				<a class="btn-secondary back-link" href="/customers">Volver al listado</a>
				{#if can('customers.update')}
					<button type="submit" class="btn-primary">Guardar cambios</button>
				{:else}
					<p class="panel-hint">Su rol no permite editar este registro.</p>
				{/if}
			</div>
		</form>
	</section>

	<CustomerAddressBook {addresses} {addressTypes} {form} inherited={customer} />
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
		/* `minmax(0, 1fr)` y no `1fr`: el minimo de `1fr` es `auto`, y un input
		   o una tabla dentro reventarian la columna. */
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
		/* `start` y no `stretch`: con dos direcciones, estirar la tarjeta
		   derecha a la altura del formulario deja un socavon vacio. */
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
