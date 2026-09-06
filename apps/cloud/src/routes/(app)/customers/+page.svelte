<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import { recordStateBadgeClass, recordStateLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import { stateOptions } from '$lib/list-filters';
	import { can } from '$lib/can';

	let { data } = $props();

	/** @param {Record<string, string | null>} cambios */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	let recargando = $state(false);

	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}
</script>

<!--
	Las herramientas van FUERA de la tarjeta y el contenido dentro: navegar la
	pantalla es un trabajo distinto de filtrar sus datos. Mismas clases que
	Órdenes/Cotizaciones/Facturas/Eventos, sin Quick range ni rango de fechas:
	este listado no tiene ninguna noción de fecha que filtrar.
-->
<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/dashboard" aria-label="Volver al dashboard" title="Volver al dashboard">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar la lista"
			title="Recargar la lista"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>

	<div class="herramientas-datos">
		<StatusSelect
			name="state"
			value={String(data.state)}
			options={stateOptions()}
			label="Estado del registro"
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ state: e.currentTarget.value })}
		/>
		{#if can('customers.create')}
			<a class="btn-primary btn-new" href="/customers/new">Nuevo cliente</a>
		{/if}
	</div>
</div>

<section class="panel">
	<FilterBar search={{ name: 'search', placeholder: 'Nombre, email o teléfono', value: data.search }} />

	{#if data.customers.length === 0}
		<p class="empty-state">No hay clientes con este filtro.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Cliente</th>
					<th>Email</th>
					<th>Teléfono</th>
					<th>Estado</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.customers as customer (customer.id)}
					<tr>
						<td>{customer.name}</td>
						<td>{customer.email || '—'}</td>
						<td>{customer.phone || '—'}</td>
						<td>
							<span class="badge {recordStateBadgeClass(customer.is_active)}">
								{recordStateLabel(customer.is_active)}
							</span>
						</td>
						<td><a class="btn-edit" href="/customers/{customer.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
