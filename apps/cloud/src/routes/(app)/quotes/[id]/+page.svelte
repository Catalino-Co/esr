<script>
	import { applyAction, enhance } from '$app/forms';
	import { formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();
	/**
	 * `$derived`, NO una desestructuración suelta.
	 *
	 * `const { x } = data` se evalúa UNA vez al montar. Al navegar entre dos
	 * registros de la misma ruta, SvelteKit reutiliza el componente y solo
	 * cambia `data`: la pantalla se quedaba enseñando el registro anterior con
	 * la URL del nuevo.
	 */
	const quote = $derived(data.quote);
	const items = $derived(data.items);
	const canEdit = $derived(data.canEdit);

	// `canEdit` es la regla de negocio (estado de la cotización);
	// `can(...)` es la regla de rol. Ambas deben cumplirse.
	const mayEdit = $derived(canEdit && can('quotes.update'));

	/**
	 * Copiar es distinto de editar: sale una cotización NUEVA, en borrador y con
	 * número propio. Por eso se puede copiar una ya convertida o cancelada, que
	 * es justo el caso habitual —repetir el trabajo del año pasado— y por eso el
	 * permiso es `quotes.create`.
	 */
	let copiando = $state(false);
	let errorCopia = $state(null);
	let destino = $state({ client_id: String(quote.client_id ?? ''), event_id: '' });

	function abrirCopia() {
		destino = {
			client_id: String(quote.client_id ?? ''),
			event_id: String(quote.event_id ?? '')
		};
		errorCopia = null;
		copiando = true;
	}

	function cerrarCopia() {
		copiando = false;
		errorCopia = null;
	}

	const alCopiar = () => async ({ update, result }) => {
		// Solo `failure` es un fallo. La copia responde con un REDIRECT a la
		// cotización nueva, y tratar eso como «no éxito» pintaba «No se pudo
		// copiar» encima justo mientras la navegación se estaba produciendo.
		if (result.type === 'failure') {
			await update({ reset: false });
			errorCopia = result.data?.error ?? 'No se pudo copiar la cotización.';
			return;
		}
		// `applyAction`, no `update()`. La copia responde con un redirect a la
		// cotización nueva; `update()` reaplica los datos de ESTA página encima,
		// así que la URL cambiaba a /quotes/4 y la pantalla seguía enseñando la
		// COT-000002 de la que se copió.
		cerrarCopia();
		await applyAction(result);
	};

	/** Los eventos se acotan al cliente destino: un evento de otro no encaja. */
	const eventosDelDestino = $derived(
		data.events.filter((evento) => String(evento.client_id) === String(destino.client_id))
	);

	// Al cambiar de cliente, el evento heredado deja de valer.
	$effect(() => {
		if (destino.event_id && !eventosDelDestino.some((e) => String(e.id) === String(destino.event_id))) {
			destino.event_id = '';
		}
	});

	const otroCliente = $derived(String(destino.client_id) !== String(quote.client_id ?? ''));
</script>

<section class="panel">
	<div class="page-header">
		<h1>Cotización {quote.quote_number || `#${quote.id}`}</h1>
		<div class="page-header-actions">
			{#if can('quotes.create')}
				<button type="button" class="btn-secondary" onclick={abrirCopia}>Copiar</button>
			{/if}
			<a class="btn-secondary" href="/quotes/{quote.id}/print" target="_blank" rel="noopener">Imprimir</a>
			<a class="btn-secondary" href="/quotes">Volver</a>
		</div>
	</div>

	{#if !copiando}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		{#if form?.success}
			<p class="badge badge-active">Actualizado.</p>
		{/if}
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{data.customer?.name ?? '—'}</strong><span>Cliente</span></div>
		<div class="metric"><strong>{data.event?.name ?? '—'}</strong><span>Evento</span></div>
		<div class="metric">
			<strong>
				<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
			</strong>
			<span>Estado</span>
		</div>
		<div class="metric"><strong>{formatMoney(quote.total)}</strong><span>Total</span></div>
	</div>

	{#if data.linkedOrder}
		<p>Orden generada: <a href="/work-orders/{data.linkedOrder.id}">{data.linkedOrder.order_number || `#${data.linkedOrder.id}`}</a></p>
	{/if}

	<h2>Artículos</h2>
	{#if items.length === 0}
		<p class="empty-state">Sin artículos todavía.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Artículo</th><th>Código</th><th>Cant.</th><th>Precio</th><th>Total</th><th></th></tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					<tr>
						<td>{item.name}</td>
						<td>{item.code || '—'}</td>
						<td>{item.quantity}</td>
						<td>{Number(item.price).toFixed(2)}</td>
						<td>{Number(item.total || 0).toFixed(2)}</td>
						<td>
							{#if mayEdit}
								<form method="POST" action="?/removeItem" use:enhance style="display:inline">
									<input type="hidden" name="itemId" value={item.id} />
									<button type="submit" class="btn-link">Quitar</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if mayEdit}
		{#if data.packages.length > 0}
			<h3 style="margin-top: 24px">Agregar paquete</h3>
			<form method="POST" action="?/addPackage" class="form-grid" use:enhance>
				<div class="form-field">
					<label for="package_id">Paquete</label>
					<select id="package_id" name="package_id" required>
						{#each data.packages as pkg (pkg.id)}
							<option value={pkg.id}>{pkg.name} ({pkg.item_count} artículo(s))</option>
						{/each}
					</select>
				</div>
				<div class="form-field form-field--action">
					<button type="submit" class="btn-secondary">Insertar paquete</button>
				</div>
				<p class="panel-hint" style="grid-column: 1 / -1">
					Se añade como líneas sueltas, con el precio vigente de cada artículo. Después se editan
					como cualquier otra línea.
				</p>
			</form>
		{/if}

		<h3 style="margin-top: 24px">Agregar artículo</h3>
		<form method="POST" action="?/addItem" class="form-grid" use:enhance>
			<div class="form-field">
				<label for="item_id">Artículo</label>
				<select id="item_id" name="item_id" required>
					{#each data.inventory as inv (inv.id)}
						<option value={inv.id}>{inv.name} ({inv.internal_code || 'sin código'})</option>
					{/each}
				</select>
			</div>
			<div class="form-field">
				<label for="quantity">Cantidad</label>
				<input id="quantity" name="quantity" type="number" min="1" value="1" required />
			</div>
			<div class="form-field">
				<label for="price">Precio unitario</label>
				<input id="price" name="price" type="number" min="0" step="0.01" value="0" required />
			</div>
			<div class="form-field form-field--action">
				<button type="submit" class="btn-primary">Agregar</button>
			</div>
		</form>

		<h3 style="margin-top: 24px">Totales y notas</h3>
		<form method="POST" action="?/updateQuote" class="form-grid" use:enhance>
			<div class="form-field"><span class="form-field-label">Subtotal</span><input value={Number(quote.subtotal || 0).toFixed(2)} readonly /></div>
			<div class="form-field"><label for="discount">Descuento</label><input id="discount" name="discount" type="number" min="0" step="0.01" value={quote.discount ?? 0} /></div>
			<div class="form-field"><label for="tax_amount">Impuesto</label><input id="tax_amount" name="tax_amount" type="number" min="0" step="0.01" value={quote.tax_amount ?? 0} /></div>
			<div class="form-field full"><label for="notes">Notas</label><textarea id="notes" name="notes" rows="2">{quote.notes ?? ''}</textarea></div>
			<div class="form-field form-field--action"><button type="submit" class="btn-secondary">Recalcular / guardar</button></div>
		</form>
	{/if}

	{#if canEdit}
		<div class="page-actions" style="margin-top: 20px">
			{#if quote.status !== 'aprobada' && quote.status !== 'convertida' && can('quotes.approve')}
				<form method="POST" action="?/approve" use:enhance><button type="submit" class="btn-primary">Aprobar cotización</button></form>
			{/if}
			{#if quote.status === 'aprobada' && can('quotes.convert')}
				<form method="POST" action="?/convert" use:enhance><button type="submit" class="btn-primary">Convertir a orden</button></form>
			{/if}
			{#if can('quotes.cancel')}
				<form method="POST" action="?/cancel" use:enhance><button type="submit" class="btn-danger">Cancelar cotización</button></form>
			{/if}
		</div>
	{/if}
</section>


<Modal bind:open={copiando} size="sm" title="Copiar cotización" onclose={cerrarCopia}>
	{#if errorCopia}
		<div class="alert-error" role="alert">{errorCopia}</div>
	{/if}

	<p class="panel-hint">
		Se copian los artículos con sus fechas, el descuento, el impuesto, las notas y las
		condiciones. La copia nace en <strong>borrador</strong>, con número nuevo y fecha de hoy.
	</p>

	<form id="copiar-cotizacion" method="POST" action="?/copy" class="form-grid" use:enhance={alCopiar}>
		<div class="form-field full">
			<label for="copia_client">Cliente *</label>
			<select id="copia_client" name="client_id" required bind:value={destino.client_id}>
				<option value="">Elija el cliente</option>
				{#each data.customers as customer (customer.id)}
					<option value={customer.id}>{customer.name}</option>
				{/each}
			</select>
		</div>
		<div class="form-field full">
			<label for="copia_event">Evento</label>
			<select id="copia_event" name="event_id" bind:value={destino.event_id}>
				<option value="">Sin evento</option>
				{#each eventosDelDestino as evento (evento.id)}
					<option value={evento.id}>{evento.name} — {evento.date}</option>
				{/each}
			</select>
			{#if destino.client_id && eventosDelDestino.length === 0}
				<p class="ayuda">Ese cliente no tiene eventos: la copia quedará sin evento.</p>
			{/if}
		</div>
	</form>

	{#if otroCliente}
		<p class="panel-hint">
			Va a otro cliente. Se copian los precios acordados con el original: revíselos si su
			tarifa es distinta.
		</p>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarCopia}>Cancelar</button>
		<button type="submit" form="copiar-cotizacion" class="btn-primary">Copiar</button>
	{/snippet}
</Modal>

<style>
	.ayuda {
		margin: var(--sp-1) 0 0;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--danger);
		cursor: pointer;
	}
</style>
