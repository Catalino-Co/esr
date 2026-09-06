<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import Modal from '$lib/components/Modal.svelte';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import BuscarPaquete from './BuscarPaquete.svelte';
	import { stateOptions } from '$lib/list-filters';
	import { can } from '$lib/can';
	import { dangerModal } from '$lib/stores/dangerModal';
	import { toasts } from '$lib/stores/toasts';
	import { recordStateBadgeClass, recordStateLabel } from '@esr/core';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
	});

	/**
	 * El parte de lote —activar/inactivar/archivar varios a la vez—, mismo
	 * patrón que el de Cotizaciones: `warning` si algo se saltó, `success` si
	 * no.
	 */
	$effect(() => {
		if (!form?.bulk) return;
		const parte = form.bulk;
		const titulo =
			parte.hechas === 1 ? `1 paquete ${parte.accion}.` : `${parte.hechas} paquetes ${parte.accion}s.`;
		const tipo = parte.saltadas.length ? 'warning' : 'success';
		toasts[tipo]({
			message: titulo,
			items: parte.saltadas.length ? ['Se quedaron fuera:', ...parte.saltadas] : undefined
		});
	});

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

	/* El diálogo de buscar por código NO va en la URL: es una ayuda de
	   navegación de paso. */
	let buscandoPorCodigo = $state(false);

	/* ── Selección múltiple ──────────────────────────────────────────────────
	 * Mismo patrón que Cotizaciones: el `Set` se reasigna con una copia, nunca
	 * se muta.
	 */
	let modo = $state(false);
	let elegidas = $state(new Set());

	function alternarModo() {
		modo = !modo;
		if (!modo) elegidas = new Set();
	}

	/** @param {unknown} id */
	function alternar(id) {
		const copia = new Set(elegidas);
		const clave = String(id);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		elegidas = copia;
	}

	function alternarTodas() {
		elegidas = todas ? new Set() : new Set(data.packages.map((p) => String(p.id)));
	}

	const total = $derived(data.packages.length);
	const todas = $derived(total > 0 && elegidas.size === total);
	const algunas = $derived(elegidas.size > 0 && !todas);

	const seleccionadas = $derived(data.packages.filter((p) => elegidas.has(String(p.id))));
	const activables = $derived(seleccionadas.filter((p) => p.is_active !== 1).length);
	const inactivables = $derived(seleccionadas.filter((p) => p.is_active !== 2).length);
	const archivables = $derived(seleccionadas.filter((p) => p.is_active !== 0).length);

	const alEnviar = () => async (/** @type {{ update: Function }} */ { update }) => {
		await update({ reset: false });
		elegidas = new Set();
	};

	// El alta se abre en un dialogo desde la cabecera.
	let creating = $state(false);
	let draft = $state({});
	/**
	 * Error propio, NO leido de `form`: las actions en bloque escriben en el
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
		<button
			type="button"
			class="grupo-btn"
			onclick={() => (buscandoPorCodigo = true)}
			aria-label="Buscar un paquete por su código"
			title="Buscar un paquete por su código"
		>
			<Icon name="search" size={18} />
		</button>
		<button
			type="button"
			class="grupo-btn"
			class:encendido={modo}
			aria-pressed={modo}
			aria-label={modo ? 'Salir del modo selección' : 'Seleccionar varios paquetes'}
			title={modo ? 'Salir del modo selección' : 'Seleccionar varios paquetes'}
			onclick={alternarModo}
		>
			<Icon name="listChecks" size={18} />
		</button>
	</div>

	<div class="herramientas-datos">
		<StatusSelect
			name="state"
			value={String(data.state)}
			options={stateOptions()}
			label="Estado del paquete"
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ state: e.currentTarget.value })}
		/>
		{#if can('packages.create')}
			<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nuevo paquete</button>
		{/if}
	</div>
</div>

<section class="panel">
	<FilterBar search={{ name: 'search', placeholder: 'Nombre del paquete', value: data.search }} />

	<p class="panel-hint">
		Agrupan artículos que se alquilan juntos. Desde una cotización se insertan de una vez y se
		explotan en sus líneas, con el precio vigente de cada artículo.
	</p>

	{#if data.packages.length === 0}
		<p class="empty-state">Todavía no hay paquetes. Crea el primero con «Nuevo paquete».</p>
	{:else}
		<!-- El <form> envuelve la tabla para que las casillas se serialicen solas. -->
		<form method="POST" use:enhance={alEnviar}>
			{#if modo}
				<div class="barra-seleccion">
					<span class="cuenta">
						{elegidas.size}
						{elegidas.size === 1 ? 'seleccionado' : 'seleccionados'}
					</span>
					<div class="acciones">
						<button type="submit" formaction="?/activateMany" class="btn-success" disabled={activables === 0}>
							Activar ({activables})
						</button>
						<button type="submit" formaction="?/deactivateMany" class="btn-secondary" disabled={inactivables === 0}>
							Inactivar ({inactivables})
						</button>
						<button type="submit" formaction="?/archiveMany" class="btn-danger" disabled={archivables === 0}>
							<Icon name="x" size={16} />
							Archivar ({archivables})
						</button>
					</div>
				</div>
			{/if}

			<table class="data-table data-table--acento">
				<thead>
					<tr>
						{#if modo}
							<th class="check">
								<input
									type="checkbox"
									checked={todas}
									indeterminate={algunas}
									onchange={alternarTodas}
									aria-label="Seleccionar todos los de la pantalla"
								/>
							</th>
						{/if}
						<th>Código</th>
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
						<tr class:fila-inactiva={pkg.is_active !== 1}>
							{#if modo}
								<td class="check">
									<input
										type="checkbox"
										name="ids"
										value={pkg.id}
										checked={elegidas.has(String(pkg.id))}
										onchange={() => alternar(pkg.id)}
										aria-label="Seleccionar {pkg.name}"
									/>
								</td>
							{/if}
							<td>{pkg.code}</td>
							<td>{pkg.name}</td>
							<td>{pkg.description || '—'}</td>
							<td class="num">{pkg.item_count}</td>
							<td class="num">{money(pkg.suggested_price)}</td>
							<td>
								<span class="badge {recordStateBadgeClass(pkg.is_active)}">
									{recordStateLabel(pkg.is_active)}
								</span>
							</td>
							<td class="acciones"><a class="btn-view" href="/packages/{pkg.id}">Ver</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</form>
	{/if}
</section>

{#if buscandoPorCodigo}
	<BuscarPaquete onclose={() => (buscandoPorCodigo = false)} />
{/if}

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
		<p class="form-hint full">El código se asigna automáticamente al guardar.</p>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarAlta}>Cancelar</button>
		<button type="submit" form="package-form" class="btn-primary">Crear paquete</button>
	{/snippet}
</Modal>

<style>
	.num {
		text-align: right;
		white-space: nowrap;
	}

	.fila-inactiva td {
		opacity: 0.6;
	}

	.check {
		width: 2.5rem;
	}

	/* ── La barra de selección ──────────────────────────────────────────── */

	.barra-seleccion {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		margin-bottom: var(--sp-3);
		background: var(--surface-sunken);
		border-radius: var(--border-radius-sm);
	}

	.cuenta {
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.acciones {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}
</style>
