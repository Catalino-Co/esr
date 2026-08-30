<script>
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import { can } from '$lib/can';
	import { stateSelect } from '$lib/list-filters';

	let { data, form } = $props();

	// El alta se abre en un dialogo desde la cabecera.
	let creating = $state(false);
	let draft = $state({});
	/**
	 * Error propio, NO leido de `form`: el `?/toggle` de cada fila escribe en el
	 * mismo objeto y acabaria pintandose dentro del dialogo.
	 */
	let errorCrear = $state(null);

	function abrirAlta() {
		draft = {};
		errorCrear = null;
		creating = true;
	}

	function cerrarAlta() {
		creating = false;
		draft = {};
		errorCrear = null;
	}

	/**
	 * El alta termina en `redirect` al paquete recien creado, asi que el exito
	 * nunca llega aqui: se lo lleva la navegacion. Solo hay que atender el error.
	 */
	const alCrear = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			if (result.data?.values) draft = result.data.values;
			errorCrear = result.data?.error ?? 'No se pudo crear el paquete.';
		}
	};

	const money = (v) =>
		Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<section class="panel">
	<FilterBar
		search={{ name: 'search', placeholder: 'Nombre del paquete', value: data.search }}
		selects={[stateSelect(data.state)]}
	>
		{#snippet actions()}
			{#if can('packages.create')}
				<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nuevo paquete</button>
			{/if}
		{/snippet}
	</FilterBar>

	<p class="panel-hint">
		Agrupan artículos que se alquilan juntos. Desde una cotización se insertan de una vez y se
		explotan en sus líneas, con el precio vigente de cada artículo.
	</p>

	<!-- Se callan con el dialogo abierto: su error se pinta dentro. -->
	{#if !creating}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="alert-success" role="status">{form.success}</div>
		{/if}
	{/if}

</section>

<section class="panel">
	<h2 class="sec-title">Registrados ({data.packages.length})</h2>

	{#if data.packages.length === 0}
		<p class="empty-state">Todavía no hay paquetes. Crea el primero con «Nuevo paquete».</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Nombre</th>
					<th>Descripción</th>
					<th class="num">Artículos</th>
					<th class="num">Precio sugerido</th>
					<th>Estado</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.packages as pkg (pkg.id)}
					{@const activo = pkg.is_active === 1}
					<tr class:fila-inactiva={!activo}>
						<td>{pkg.name}</td>
						<td>{pkg.description || '—'}</td>
						<td class="num">{pkg.item_count}</td>
						<td class="num">{money(pkg.suggested_price)}</td>
						<td>
							<span class="badge" class:badge-active={activo} class:badge-inactive={!activo}>
								{activo ? 'Activo' : 'Inactivo'}
							</span>
						</td>
						<td class="acciones">
							<a href="/packages/{pkg.id}">Ver</a>
							{#if can('packages.archive')}
								<form method="POST" action="?/toggle" use:enhance>
									<input type="hidden" name="id" value={pkg.id} />
									<input type="hidden" name="is_active" value={activo ? '0' : '1'} />
									<button type="submit" class={activo ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
										{activo ? 'Desactivar' : 'Reactivar'}
									</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal bind:open={creating} title="Nuevo paquete" onclose={cerrarAlta}>
	{#if errorCrear}
		<div class="alert-error" role="alert">{errorCrear}</div>
	{/if}

	<form id="package-form" method="POST" action="?/create" class="form-grid" use:enhance={alCrear}>
		<div class="form-field">
			<label for="name">Nombre *</label>
			<input
				id="name"
				name="name"
				required
				placeholder="Paquete básico de sonido"
				value={draft.name ?? ''}
			/>
		</div>
		<div class="form-field">
			<label for="suggested_price">Precio sugerido</label>
			<input
				id="suggested_price"
				name="suggested_price"
				type="number"
				min="0"
				step="0.01"
				value={draft.suggested_price ?? '0'}
			/>
		</div>
		<div class="form-field full">
			<label for="description">Descripción</label>
			<input id="description" name="description" value={draft.description ?? ''} />
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarAlta}>Cancelar</button>
		<button type="submit" form="package-form" class="btn-primary">Crear paquete</button>
	{/snippet}
</Modal>

<style>
	.sec-title {
		margin: 0 0 var(--sp-4);
		font-size: var(--font-md);
		font-weight: 600;
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.acciones {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.fila-inactiva td {
		opacity: 0.6;
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
