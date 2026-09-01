<script>
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import { formatDateAbsolute, statusBadgeClass, statusLabel } from '@esr/core';

	/**
	 * Buscar una orden por su número.
	 *
	 * NO es un desplegable flotante, y es deliberado: es lo que se pidió
	 * —elegir y luego pulsar— y esquiva de paso los tres defectos de los
	 * combobox de ESR Pro (el `mousedown` en vez de `click` para adelantarse al
	 * blur, el `setTimeout` de 180 ms que lo sostiene, y la lista sin teclado).
	 * Aquí la lista vive dentro del propio diálogo: no hay blur del que
	 * escaparse.
	 *
	 * @type {{ onclose: () => void }}
	 */
	let { onclose } = $props();

	let termino = $state('');
	let resultados = $state(/** @type {Array<any>} */ ([]));
	let elegida = $state(/** @type {number} */ (-1));
	let buscando = $state(false);
	let error = $state('');

	let temporizador = /** @type {any} */ (null);
	/* La petición anterior se ABORTA: sin esto, teclear rápido deja respuestas en
	   vuelo que llegan desordenadas y pintan resultados de un término viejo. */
	let enVuelo = /** @type {AbortController | null} */ (null);

	function alTeclear(/** @type {Event & { currentTarget: HTMLInputElement }} */ evento) {
		termino = evento.currentTarget.value;
		elegida = -1;
		clearTimeout(temporizador);
		temporizador = setTimeout(buscar, 250);
	}

	async function buscar() {
		enVuelo?.abort();
		if (termino.trim().length < 2) {
			resultados = [];
			buscando = false;
			return;
		}
		const control = new AbortController();
		enVuelo = control;
		buscando = true;
		error = '';
		try {
			const res = await fetch(`/work-orders/buscar?q=${encodeURIComponent(termino.trim())}`, {
				signal: control.signal
			});
			if (!res.ok) throw new Error('El servidor rechazó la búsqueda.');
			const { ordenes } = await res.json();
			resultados = ordenes;
			elegida = ordenes.length > 0 ? 0 : -1;
		} catch (/** @type {any} */ e) {
			if (e?.name === 'AbortError') return;
			error = 'No se pudo buscar. Inténtelo de nuevo.';
			resultados = [];
		} finally {
			if (enVuelo === control) buscando = false;
		}
	}

	function abrir() {
		const orden = resultados[elegida];
		if (!orden) return;
		goto(`/work-orders/${orden.id}`);
	}

	/* Flechas y Enter sobre el input: la lista se maneja sin soltar el teclado,
	   que es lo que hace útil un buscador. */
	function alPulsar(/** @type {KeyboardEvent} */ evento) {
		if (resultados.length === 0) return;
		if (evento.key === 'ArrowDown') {
			evento.preventDefault();
			elegida = (elegida + 1) % resultados.length;
		} else if (evento.key === 'ArrowUp') {
			evento.preventDefault();
			elegida = (elegida - 1 + resultados.length) % resultados.length;
		} else if (evento.key === 'Enter') {
			evento.preventDefault();
			abrir();
		}
	}

	/* La fila elegida a la vista: con las flechas se sale del recorte enseguida
	   y el resaltado desaparecería sin que nada lo dijera. */
	$effect(() => {
		if (elegida < 0) return;
		document
			.getElementById(`resultado-orden-${elegida}`)
			?.scrollIntoView({ block: 'nearest' });
	});
</script>

<Modal open title="Buscar orden por número" size="md" {onclose}>
	{#if error}
		<div class="alert-error" role="alert">{error}</div>
	{/if}

	<!-- Patrón combobox de ARIA: el foco NO se mueve del input nunca, y la
	     selección se anuncia con `aria-activedescendant`. Eso es lo que evita la
	     carrera de blur que los combobox de ESR Pro parchean con `mousedown` y
	     un `setTimeout` de 180 ms. -->
	<input
		class="buscador"
		type="search"
		role="combobox"
		value={termino}
		oninput={alTeclear}
		onkeydown={alPulsar}
		placeholder="ORD-000012"
		aria-label="Número de orden"
		aria-expanded={resultados.length > 0}
		aria-controls="resultados-orden"
		aria-autocomplete="list"
		aria-activedescendant={elegida >= 0 ? `resultado-orden-${elegida}` : undefined}
		autocomplete="off"
	/>

	{#if termino.trim().length < 2}
		<p class="panel-hint">
			Escriba al menos dos caracteres del número. Se busca en todas las órdenes, también fuera
			del rango de fechas del listado.
		</p>
	{:else if buscando && resultados.length === 0}
		<p class="panel-hint">Buscando…</p>
	{:else if resultados.length === 0}
		<p class="empty-state">Ninguna orden con ese número.</p>
	{:else}
		<!-- `<li role="option">` y no `<button>`: un botón dentro de una opción
		     roba el foco al input, que es justo lo que no puede pasar aquí. -->
		<ul class="resultados" id="resultados-orden" role="listbox" aria-label="Órdenes encontradas">
			{#each resultados as orden, indice (orden.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="resultado-orden-{indice}"
					class="resultado"
					class:elegido={indice === elegida}
					role="option"
					aria-selected={indice === elegida}
					onclick={() => (elegida = indice)}
					ondblclick={abrir}
				>
					<span class="numero">{orden.order_number || `#${orden.id}`}</span>
					<span class="cliente">{orden.client_name}</span>
					<span class="fecha">{formatDateAbsolute(orden.date)}</span>
					<span class="badge {statusBadgeClass(orden.status)}">{statusLabel(orden.status)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={onclose}>Cancelar</button>
		<button type="button" class="btn-primary" onclick={abrir} disabled={elegida < 0}>
			Abrir orden
		</button>
	{/snippet}
</Modal>

<style>
	/* Los campos sueltos no heredan nada: el estilo de campo de theme.css cuelga
	   de `.form-grid`, y aquí no hay rejilla. */
	.buscador {
		width: 100%;
		font-family: inherit;
		font-size: var(--font-sm);
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
		color: var(--text-primary);
	}

	.buscador:focus {
		outline: none;
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	.resultados {
		list-style: none;
		margin: var(--sp-3) 0 0;
		padding: 0;
		max-height: 18rem;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
	}

	.resultado {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-primary);
		cursor: pointer;
	}

	.resultado:last-child {
		border-bottom: none;
	}

	.resultado:hover {
		background: var(--bg-hover);
	}

	/* El elegido se marca con relleno de acento: es la fila que abrirá el botón
	   del pie, y con las flechas hay que verla moverse. */
	.resultado.elegido {
		background: var(--accent);
		color: var(--text-on-accent);
	}

	.numero {
		font-weight: 600;
	}

	.cliente,
	.fecha {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fecha {
		font-size: var(--font-xs);
	}

	@media (max-width: 560px) {
		.resultado {
			grid-template-columns: minmax(0, 1fr) auto;
		}
	}
</style>
