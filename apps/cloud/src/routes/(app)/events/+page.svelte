<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { EventCalendar, Icon } from '@esr/ui';
	import {
		PERIODOS,
		PERIODO_LABELS,
		formatDateAbsolute,
		rangoDelPeriodo,
		statusBadgeClass,
		statusLabel
	} from '@esr/core';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import EventoCampos from './EventoCampos.svelte';
	import BuscarEvento from './BuscarEvento.svelte';
	import { can } from '$lib/can';
	import { dangerModal } from '$lib/stores/dangerModal';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
	});

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

	let temporizador = /** @type {any} */ (null);
	function alBuscar(/** @type {Event & { currentTarget: HTMLInputElement }} */ evento) {
		const valor = evento.currentTarget.value;
		clearTimeout(temporizador);
		temporizador = setTimeout(() => {
			const url = new URL(page.url);
			if (valor) url.searchParams.set('search', valor);
			else url.searchParams.delete('search');
			goto(url, { keepFocus: true, replaceState: true, noScroll: true, invalidateAll: true });
		}, 300);
	}

	/** @param {string} periodo */
	function aplicarPeriodo(periodo) {
		const rango = rangoDelPeriodo(/** @type {any} */ (periodo));
		irCon({ dateFrom: rango.desde, dateTo: rango.hasta });
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
	 *
	 * El rango de fechas y el Quick range SOLO aplican a la Tabla: el
	 * Calendario pagina de mes en mes en memoria, sin volver a pedir datos, y
	 * si viera solo lo que la Tabla tiene cargado, un mes fuera del rango se
	 * vería vacío aunque haya eventos reales ese mes. Por eso `data.eventsCalendario`
	 * es una lista APARTE, sin fecha, y por eso el rango/Quick range se ocultan
	 * en esta vista en vez de aplicarse sin efecto.
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

	/* El diálogo de buscar por nombre NO va en la URL: es una ayuda de
	   navegación de paso, no un estado que compartir. */
	let buscandoNombre = $state(false);

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
			onclick={() => (buscandoNombre = true)}
			aria-label="Buscar un evento por su nombre"
			title="Buscar un evento por su nombre"
		>
			<Icon name="search" size={18} />
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
		{#if !calendario}
			<div class="grupo" role="group" aria-label="Rango rápido">
				{#each PERIODOS as periodo (periodo)}
					<button
						type="button"
						class="grupo-btn grupo-btn--texto"
						class:encendido={data.rangoActivo === periodo}
						aria-pressed={data.rangoActivo === periodo}
						onclick={() => aplicarPeriodo(periodo)}
					>
						{PERIODO_LABELS[periodo]}
					</button>
				{/each}
			</div>
		{/if}

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
	<!-- El buscador de texto y su botón de limpiar quedan FUERA del `{#if
	     !calendario}`: es el mismo buscador de siempre y también sirve al
	     Calendario. Solo las fechas y el botón de aplicarlas son exclusivos de
	     la Tabla. -->
	<form class="filters" method="GET" data-sveltekit-keepfocus data-sveltekit-replacestate>
		<input type="hidden" name="status" value={data.status} />

		{#if !calendario}
			<div class="filters-control filters-control--date">
				<input type="date" name="dateFrom" value={data.dateFrom} aria-label="Desde" title="Desde" />
			</div>
			<div class="filters-control filters-control--date">
				<input type="date" name="dateTo" value={data.dateTo} aria-label="Hasta" title="Hasta" />
			</div>
			<button type="submit" class="filters-btn" aria-label="Buscar en el rango" title="Buscar en el rango">
				<Icon name="search" size={16} />
			</button>
		{/if}

		<div class="filters-search">
			<span class="filters-search-icon" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="15" height="15">
					<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
					<path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</span>
			<input
				type="search"
				name="search"
				value={data.search}
				placeholder="Título o lugar"
				aria-label="Buscar en la tabla"
				oninput={alBuscar}
			/>
		</div>

		<button
			type="button"
			class="filters-btn filters-btn--sm"
			disabled={!data.search}
			onclick={() => irCon({ search: null })}
			aria-label="Limpiar la búsqueda"
			title="Limpiar la búsqueda"
		>
			<Icon name="x" size={14} />
		</button>
	</form>

	{#if !calendario}
		<p class="rango">
			{#if data.invertido}
				<span class="aviso">La fecha «Hasta» es anterior a la de «Desde».</span>
			{:else if data.dateFrom && data.dateTo}
				Eventos del {formatDateAbsolute(data.dateFrom)} al {formatDateAbsolute(data.dateTo)}
			{:else if data.dateFrom}
				Eventos desde el {formatDateAbsolute(data.dateFrom)}
			{:else if data.dateTo}
				Eventos hasta el {formatDateAbsolute(data.dateTo)}
			{:else}
				Todos los eventos
			{/if}
			· {data.events.length}
			{data.events.length === 1 ? 'resultado' : 'resultados'}
			{#if data.hayMas}<span class="aviso">— hay más de 100: acote las fechas.</span>{/if}
		</p>
	{/if}

	{#if calendario}
		<EventCalendar events={data.eventsCalendario} colorOf={colorDe} onSelect={abrirFicha} />
	{:else if data.events.length === 0}
		<p class="empty-state">Ningún evento en este rango de fechas.</p>
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
				conEstado={false}
			/>
		</form>

		{#snippet footer()}
			<button type="button" class="btn-secondary" onclick={cerrarAlta}>Cancelar</button>
			<button type="submit" form="alta-evento" class="btn-primary">Crear evento</button>
		{/snippet}
	</Modal>
{/if}

{#if buscandoNombre}
	<BuscarEvento onclose={() => (buscandoNombre = false)} />
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

	.rango {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.aviso {
		color: var(--danger-text);
	}
</style>
