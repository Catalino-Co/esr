<script>
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import { formatDate, formatMoney, statusBadgeClass, statusLabel } from '@esr/core';

	/**
	 * El diálogo de vincular, uno para los dos tipos.
	 *
	 * Cotizaciones y órdenes se eligen igual y se vinculan igual; lo único que
	 * cambia es el rótulo, el nombre del campo y que la orden no lleva importe.
	 * Dos componentes casi iguales es la duplicación que este repo persigue en
	 * todas partes.
	 *
	 * @type {{
	 *   tipo: 'cotizacion' | 'orden',
	 *   filas: Array<any>,
	 *   hayMas: boolean,
	 *   busqueda: string,
	 *   onbuscar: (valor: string) => void,
	 *   onhecho: () => void,
	 *   onclose: () => void
	 * }}
	 */
	let { tipo, filas, hayMas, busqueda, onbuscar, onhecho, onclose } = $props();

	const esCotizacion = $derived(tipo === 'cotizacion');
	const titulo = $derived(esCotizacion ? 'Vincular cotización' : 'Vincular orden');
	const accion = $derived(esCotizacion ? '?/linkQuote' : '?/linkOrder');
	const campo = $derived(esCotizacion ? 'quote_id' : 'order_id');

	/* El error vive AQUÍ, no en `form`. `form` es único por página y la action
	   `update` del evento escribe en él: compartirlo haría que el fallo de un
	   guardado se pintase dentro del diálogo, y al revés. El diálogo se monta
	   bajo un `{#if}`, así que cada apertura nace sin error. */
	let error = $state(/** @type {string | null} */ (null));

	/**
	 * En ÉXITO cierra —y quien cierra invalida—; en FALLO NO se llama a
	 * `update()`, que escribiría en `form` y pintaría la alerta de la cabecera
	 * DETRÁS del diálogo. El error de vincular se lee aquí dentro, que es donde
	 * ocurrió, y el diálogo se queda abierto para poder elegir otra.
	 */
	const alVincular = () => async (/** @type {any} */ { result }) => {
		if (result.type === 'success') {
			onhecho();
			return;
		}
		error = result?.data?.errorVinculo ?? 'No se pudo vincular.';
	};
</script>

<Modal open title={titulo} size="lg" {onclose}>
	{#if error}
		<div class="alert-error" role="alert">{error}</div>
	{/if}

	<!-- Al enviar, no al teclear: cada búsqueda vuelve a correr el `load` de la
	     ficha entera. Y `preventDefault`, porque SvelteKit no intercepta los GET
	     nativos y sin esto cada búsqueda sería una recarga completa. -->
	<form
		class="buscador"
		onsubmit={(e) => {
			e.preventDefault();
			onbuscar(String(new FormData(e.currentTarget).get('q') ?? ''));
		}}
	>
		<!-- Sin `bind:`: el campo se lee al enviar. Lo que hay escrito no manda
		     sobre nada mientras se teclea, y el diálogo se monta de nuevo en cada
		     apertura, así que el valor de la URL es el correcto de partida. -->
		<input
			type="search"
			name="q"
			value={busqueda}
			placeholder={esCotizacion ? 'Número o cliente' : 'Número, cliente o responsable'}
			aria-label="Buscar entre las candidatas"
		/>
		<button type="submit" class="btn-secondary">Buscar</button>
	</form>

	{#if filas.length === 0}
		<p class="empty-state">
			{busqueda
				? `Ninguna coincide con «${busqueda}».`
				: esCotizacion
					? 'No hay cotizaciones libres: todas pertenecen ya a algún evento, o están canceladas.'
					: 'No hay órdenes libres: todas pertenecen ya a algún evento.'}
		</p>
	{:else}
		<div class="tabla-scroll">
			<table class="data-table">
				<thead>
					<tr>
						<th>Número</th>
						<th>Cliente</th>
						<th>Fecha</th>
						{#if esCotizacion}<th class="num">Total</th>{/if}
						<th>Estado</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filas as fila (fila.id)}
						<tr>
							<td>{fila.numero}</td>
							<td>{fila.client_name}</td>
							<td>{fila.date ? formatDate(fila.date) : '—'}</td>
							{#if esCotizacion}<td class="num">{formatMoney(fila.total)}</td>{/if}
							<td>
								<span class="badge {statusBadgeClass(fila.status)}">{statusLabel(fila.status)}</span>
							</td>
							<td class="accion">
								<!-- Un `<form>` POR FILA, y dentro del `<td>`: un `<tr>` no se
								     puede envolver en un `<form>` —el parser lo saca de la tabla
								     y el formulario queda vacío—. Así cada botón es un submit de
								     verdad y no hay una variable compartida que pueda
								     desincronizarse de la fila que se pulsó. -->
								<form method="POST" action={accion} use:enhance={alVincular}>
									<input type="hidden" name={campo} value={fila.id} />
									<button type="submit" class="btn-primary btn-sm">Vincular</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if hayMas}
			<p class="panel-hint">
				Se muestran las 50 más recientes. Use el buscador para encontrar las demás.
			</p>
		{/if}
	{/if}

	<p class="panel-hint">
		Solo se ofrecen las que aún no pertenecen a ningún evento. Vincular no desvincula lo que ya
		estuviera unido a este.
	</p>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={onclose}>Cerrar</button>
	{/snippet}
</Modal>

<style>
	.buscador {
		display: flex;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.buscador input {
		flex: 1 1 auto;
		min-width: 0;
		font-family: inherit;
		font-size: var(--font-sm);
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
		color: var(--text-primary);
	}

	.buscador input:focus {
		outline: none;
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	.tabla-scroll {
		overflow-x: auto;
		max-height: 24rem;
		overflow-y: auto;
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.accion {
		width: 6rem;
		text-align: right;
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
