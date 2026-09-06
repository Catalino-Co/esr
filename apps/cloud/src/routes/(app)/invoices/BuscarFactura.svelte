<script>
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import { formatDateAbsolute, statusBadgeClass, statusLabel } from '@esr/core';

	/**
	 * Buscar una factura por su número. Gemelo de `work-orders/BuscarOrden.svelte`
	 * y `quotes/BuscarCotizacion.svelte`.
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
			const res = await fetch(`/invoices/buscar?q=${encodeURIComponent(termino.trim())}`, {
				signal: control.signal
			});
			if (!res.ok) throw new Error('El servidor rechazó la búsqueda.');
			const { facturas } = await res.json();
			resultados = facturas;
			elegida = facturas.length > 0 ? 0 : -1;
		} catch (/** @type {any} */ e) {
			if (e?.name === 'AbortError') return;
			error = 'No se pudo buscar. Inténtelo de nuevo.';
			resultados = [];
		} finally {
			if (enVuelo === control) buscando = false;
		}
	}

	function abrir() {
		const factura = resultados[elegida];
		if (!factura) return;
		goto(`/invoices/${factura.id}`);
	}

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

	$effect(() => {
		if (elegida < 0) return;
		document
			.getElementById(`resultado-factura-${elegida}`)
			?.scrollIntoView({ block: 'nearest' });
	});
</script>

<Modal open title="Buscar factura por número" size="md" {onclose}>
	{#if error}
		<div class="alert-error" role="alert">{error}</div>
	{/if}

	<input
		class="buscador"
		type="search"
		role="combobox"
		value={termino}
		oninput={alTeclear}
		onkeydown={alPulsar}
		placeholder="FAC-000012"
		aria-label="Número de factura"
		aria-expanded={resultados.length > 0}
		aria-controls="resultados-factura"
		aria-autocomplete="list"
		aria-activedescendant={elegida >= 0 ? `resultado-factura-${elegida}` : undefined}
		autocomplete="off"
	/>

	{#if termino.trim().length < 2}
		<p class="panel-hint">
			Escriba al menos dos caracteres del número. Se busca en todas las facturas, también fuera
			del rango de fechas del listado.
		</p>
	{:else if buscando && resultados.length === 0}
		<p class="panel-hint">Buscando…</p>
	{:else if resultados.length === 0}
		<p class="empty-state">Ninguna factura con ese número.</p>
	{:else}
		<ul class="resultados" id="resultados-factura" role="listbox" aria-label="Facturas encontradas">
			{#each resultados as factura, indice (factura.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="resultado-factura-{indice}"
					class="resultado"
					class:elegido={indice === elegida}
					role="option"
					aria-selected={indice === elegida}
					onclick={() => (elegida = indice)}
					ondblclick={abrir}
				>
					<span class="numero">{factura.invoice_number || `#${factura.id}`}</span>
					<span class="cliente">{factura.client_name}</span>
					<span class="fecha">{formatDateAbsolute(factura.date)}</span>
					<span class="badge {statusBadgeClass(factura.status)}">{statusLabel(factura.status)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={onclose}>Cancelar</button>
		<button type="button" class="btn-primary" onclick={abrir} disabled={elegida < 0}>
			Abrir factura
		</button>
	{/snippet}
</Modal>

<style>
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
