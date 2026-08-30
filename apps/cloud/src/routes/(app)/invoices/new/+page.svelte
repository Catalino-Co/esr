<script>
	import { formatDate, formatMoney } from '@esr/core';

	let { data, form } = $props();

	/** Marcadas de inicio: lo habitual es facturar todo lo entregado. */
	let elegidas = $state(new Set(data.conduces.map((c) => String(c.id))));
	let descuento = $state(form?.values?.discount ?? '');

	function alternar(id) {
		const clave = String(id);
		const copia = new Set(elegidas);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		elegidas = copia;
	}

	const subtotal = $derived(
		data.conduces
			.filter((c) => elegidas.has(String(c.id)))
			.reduce((suma, c) => suma + Number(c.total ?? 0), 0)
	);

	const rebaja = $derived(Math.max(0, Number(descuento) || 0));
	const total = $derived(Math.max(0, subtotal - rebaja));
	const excede = $derived(rebaja > subtotal);
</script>

<section class="panel">
	<div class="page-header">
		<div class="page-header-actions">
			<a class="btn-secondary" href="/invoices">Volver</a>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if data.aviso}
		<div class="alert-error" role="alert">{data.aviso}</div>
	{/if}

	{#if !data.order}
		<!-- Sin orden elegida: se enseñan las que tienen entregas sin facturar. -->
		<p class="panel-hint">
			Solo se factura lo que ya se entregó. Elija la orden cuyas entregas quiere cobrar.
		</p>

		{#if data.orders.length === 0}
			<p class="empty-state">No hay entregas pendientes de facturar.</p>
		{:else}
			<table class="data-table">
				<thead>
					<tr><th>Orden</th><th>Cliente</th><th>Entregas sin facturar</th><th>Acciones</th></tr>
				</thead>
				<tbody>
					{#each data.orders as order (order.id)}
						<tr>
							<td>{order.order_number || `#${order.id}`}</td>
							<td>{order.client_name || '—'}</td>
							<td>{order.pendientes}</td>
							<td class="row-actions">
								<a class="btn-edit" href="/invoices/new?order={order.id}">Facturar</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{:else if data.conduces.length === 0}
		<p class="empty-state">
			La orden {data.order.order_number || `#${data.order.id}`} no tiene entregas pendientes de facturar.
		</p>
	{:else}
		<!-- El `order` va en la action a proposito: `?/create` a secas reescribe
		     la query entera y, al fallar, la pantalla volvia al selector de
		     ordenes con la seleccion perdida. -->
		<form method="POST" action="?order={data.order.id}&/create">
			<input type="hidden" name="work_order_id" value={data.order.id} />

			<h2 class="sec-title">
				Entregas de {data.order.order_number || `#${data.order.id}`}
			</h2>
			<table class="data-table">
				<thead>
					<tr><th class="check"></th><th>Entrega</th><th>Fecha</th><th>Líneas</th><th class="num">Importe</th></tr>
				</thead>
				<tbody>
					{#each data.conduces as conduce (conduce.id)}
						{@const marcada = elegidas.has(String(conduce.id))}
						<tr>
							<td class="check">
								<input
									type="checkbox"
									name="conduce_ids"
									value={conduce.id}
									checked={marcada}
									onchange={() => alternar(conduce.id)}
									aria-label="Incluir {conduce.note_number}"
								/>
							</td>
							<td><a href="/conduces/{conduce.id}">{conduce.note_number}</a></td>
							<td>{formatDate(conduce.date)}</td>
							<td>{conduce.lineas}</td>
							<td class="num">{formatMoney(conduce.total)}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<div class="form-grid" style="margin-top: 16px">
				<div class="form-field">
					<label for="date">Fecha</label>
					<input id="date" name="date" type="date" value={form?.values?.date || data.hoy} />
				</div>
				<div class="form-field">
					<label for="discount">Descuento</label>
					<input
						id="discount"
						name="discount"
						type="number"
						step="0.01"
						min="0"
						bind:value={descuento}
					/>
				</div>
				<div class="form-field full">
					<label for="notes">Notas</label>
					<input id="notes" name="notes" value={form?.values?.notes ?? ''} />
				</div>
			</div>

			<div class="grid" style="margin: 16px 0">
				<div class="metric"><strong>{formatMoney(subtotal)}</strong><span>Subtotal</span></div>
				<div class="metric"><strong>{formatMoney(rebaja)}</strong><span>Descuento</span></div>
				<div class="metric"><strong>{formatMoney(total)}</strong><span>Total</span></div>
			</div>

			{#if excede}
				<div class="alert-error" role="alert">El descuento no puede superar el subtotal.</div>
			{/if}

			<div class="form-actions">
				<a class="btn-secondary" href="/invoices">Cancelar</a>
				<button type="submit" class="btn-primary" disabled={elegidas.size === 0 || excede}>
					Emitir factura
				</button>
			</div>
		</form>
	{/if}
</section>

<style>
	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
	}

	.check {
		width: 2.5rem;
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}
</style>
