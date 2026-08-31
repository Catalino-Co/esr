<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { EventCalendar, Icon } from '@esr/ui';
	import { statusBadgeClass, statusLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import EventoCampos from './EventoCampos.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	const ESTADOS = [
		{ value: '', label: 'Cualquier estado' },
		{ value: 'tentativo', label: 'Tentativo' },
		{ value: 'confirmado', label: 'Confirmado' },
		{ value: 'completado', label: 'Completado' },
		{ value: 'cancelado', label: 'Cancelado' }
	];

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

	/* ── Tabla o calendario ────────────────────────────────────────────────
	 *
	 * Un interruptor en la barra, no una ruta aparte: así los filtros valen para
	 * las dos vistas sin viajar entre pantallas ni volver a cargar los datos.
	 */
	let calendario = $state(false);

	/**
	 * El color de cada tipo, resuelto POR NOMBRE.
	 *
	 * `events.event_type` guarda el nombre en texto libre, no una clave ajena a
	 * `event_types`. Renombrar un tipo deja sin color a sus eventos; es anterior
	 * a este cambio y queda anotado, pero conviene saberlo. Se compara
	 * normalizado, igual que el índice único de la tabla.
	 */
	const colores = $derived(
		new Map(data.eventTypes.map((t) => [String(t.name).trim().toLowerCase(), t.color]))
	);
	const GRIS = '#94a3b8';
	/** @param {{ event_type?: string }} ev */
	const colorDe = (ev) => colores.get(String(ev.event_type ?? '').trim().toLowerCase()) || GRIS;

	/* ── El alta, en un diálogo con URL propia ─────────────────────────────
	 * Mismo patrón que el de cotizaciones: sobrevive a un refresco, se puede
	 * enlazar y «atrás» lo cierra.
	 */
	const abierto = $derived(page.url.searchParams.get('nueva') === '1');

	/** @param {string | null} valor */
	function nueva(valor) {
		const url = new URL(page.url);
		if (valor === null) url.searchParams.delete('nueva');
		else url.searchParams.set('nueva', valor);
		goto(url, { noScroll: true, keepFocus: true });
	}

	let borrador = $state(/** @type {Record<string, string>} */ ({}));
	/** Error propio, NO leído de `form`: `form` es único por página. */
	let errorCrear = $state(/** @type {string | null} */ (null));

	function abrirAlta() {
		borrador = {};
		errorCrear = null;
		nueva('1');
	}

	function cerrarAlta() {
		errorCrear = null;
		if (abierto) nueva(null);
	}

	const alCrear = () => async (/** @type {{ update: Function, result: any }} */ { update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			if (result.data?.values) borrador = result.data.values;
			errorCrear = result.data?.error ?? 'No se pudo crear el evento.';
		}
	};

	/** @param {{ id: unknown }} ev */
	const abrirFicha = (ev) => goto(`/events/${ev.id}`);
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
			class:encendido={calendario}
			aria-pressed={calendario}
			aria-label={calendario ? 'Ver como tabla' : 'Ver como calendario'}
			title={calendario ? 'Ver como tabla' : 'Ver como calendario'}
			onclick={() => (calendario = !calendario)}
		>
			<Icon name="calendar" size={18} />
		</button>
	</div>

	<div class="herramientas-datos">
		<StatusSelect
			name="status"
			value={data.status}
			options={ESTADOS}
			label="Estado del evento"
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ status: e.currentTarget.value })}
		/>
		{#if can('events.create')}
			<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>Nuevo evento</button>
		{/if}
	</div>
</div>

<section class="panel">
	<FilterBar search={{ name: 'search', placeholder: 'Título o lugar', value: data.search }} />

	{#if form?.error && !abierto}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	{#if calendario}
		<EventCalendar events={data.events} colorOf={colorDe} onSelect={abrirFicha} />
	{:else if data.events.length === 0}
		<p class="empty-state">No hay eventos para mostrar.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Evento</th>
					<th>Cliente</th>
					<th>Lugar</th>
					<th>Estado</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.events as event (event.id)}
					<tr>
						<!-- El color del tipo entra por `style` porque sale de la base de
						     datos: no hay forma de tenerlo en una hoja de estilos. -->
						<td class="fecha" style="border-left-color: {colorDe(event)}">{event.date || '—'}</td>
						<td>
							<span class="nombre">{event.name}</span>
							{#if event.event_type}
								<span class="tipo">
									<span class="punto" style="background: {colorDe(event)}"></span>
									{event.event_type}
								</span>
							{/if}
						</td>
						<td>{event.client_name}</td>
						<td>{event.location || '—'}</td>
						<td>
							<span class="badge {statusBadgeClass(event.status)}">{statusLabel(event.status)}</span>
						</td>
						<td><a class="btn-edit" href="/events/{event.id}">Editar</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<!-- ── Alta de evento ─────────────────────────────────────────────────────
	Solo la cabecera y la logística. El resumen de cotización y orden vive en la
	ficha, que es donde ya existen.
-->
{#if abierto}
	<Modal open title="Nuevo evento" size="lg" onclose={cerrarAlta}>
		{#if errorCrear}
			<div class="alert-error" role="alert">{errorCrear}</div>
		{/if}

		<form id="alta-evento" method="POST" action="?/create" class="form-grid" use:enhance={alCrear}>
			<EventoCampos
				valores={borrador}
				customers={data.customers}
				eventTypes={data.eventTypes}
				quotes={data.quotes}
				orders={data.orders}
				conEstado={false}
			/>
		</form>

		{#snippet footer()}
			<button type="button" class="btn-secondary" onclick={cerrarAlta}>Cancelar</button>
			<button type="submit" form="alta-evento" class="btn-primary">Crear evento</button>
		{/snippet}
	</Modal>
{/if}

<style>
	/* El filete de color del tipo. El grosor y el hueco van aquí; el COLOR lo
	   pone el marcado, porque viene de la base. */
	.fecha {
		border-left: 3px solid transparent;
		padding-left: var(--sp-3);
		font-weight: 500;
		white-space: nowrap;
	}

	.nombre {
		display: block;
		font-weight: 600;
	}

	.tipo {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.punto {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
