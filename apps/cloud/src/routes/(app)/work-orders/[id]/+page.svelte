<script>
	import { can } from '$lib/can';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const { order, items } = data;

	const status = order.status;
	const isReadOnly = status === 'cancelado' || status === 'cerrado';
</script>

<section class="panel">
	<div class="page-header">
		<h1>Orden {order.order_number || `#${order.id}`}</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/work-orders/{order.id}/print" target="_blank" rel="noopener">Imprimir orden</a>
			<a class="btn-secondary" href="/work-orders">Volver</a>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{data.customer?.name ?? '—'}</strong><span>Cliente</span></div>
		<div class="metric"><strong>{data.event?.name ?? '—'}</strong><span>Evento</span></div>
		<div class="metric"><strong>{order.status}</strong><span>Estado</span></div>
		<div class="metric"><strong>{Number(order.total || 0).toFixed(2)}</strong><span>Total</span></div>
	</div>

	{#if data.quote}
		<p>Cotización origen: <a href="/quotes/{data.quote.id}">{data.quote.quote_number || `#${data.quote.id}`}</a></p>
	{/if}

	{#if !isReadOnly}
		<div class="page-actions" style="margin-bottom: 20px">
			{#if status === 'confirmado'}
				{#if can('work_orders.prepare')}
					<form method="POST" action="?/prepare" use:enhance>
						<button type="submit" class="btn-primary">Preparar orden</button>
					</form>
				{/if}
				{#if can('operations.deliver')}
					<a class="btn-secondary" href="/work-orders/{order.id}/delivery">Generar conduce de entrega</a>
				{/if}
				{#if can('work_orders.cancel')}
					<form method="POST" action="?/cancel" use:enhance>
						<button type="submit" class="btn-danger">Cancelar orden</button>
					</form>
				{/if}
			{:else if status === 'en_preparacion'}
				{#if can('operations.deliver')}
					<a class="btn-primary" href="/work-orders/{order.id}/delivery">Registrar entrega</a>
				{/if}
			{:else if status === 'entregado' || status === 'parcialmente_devuelto'}
				{#if can('operations.return')}
					<a class="btn-primary" href="/work-orders/{order.id}/return">Registrar devolución</a>
				{/if}
				{#if can('incidents.create')}
					<a class="btn-secondary" href="/work-orders/{order.id}/incidents">Registrar incidencia</a>
				{/if}
			{:else if status === 'devuelto'}
				{#if can('work_orders.close')}
					<form method="POST" action="?/close" use:enhance>
						<button type="submit" class="btn-primary">Cerrar orden</button>
					</form>
				{/if}
			{/if}
			<a class="btn-secondary" href="/work-orders/{order.id}/checklists">Checklists</a>
		</div>
	{/if}

	<h2>Artículos</h2>
	{#if items.length === 0}
		<p class="empty-state">Sin artículos.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Artículo</th><th>Código</th><th>Reservado</th><th>Entregado</th><th>Devuelto</th><th>Precio</th><th>Estado</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					<tr>
						<td>{item.name}</td>
						<td>{item.internal_code || '—'}</td>
						<td>{item.quantity}</td>
						<td>{item.delivered_quantity ?? 0}</td>
						<td>{item.returned_quantity ?? 0}</td>
						<td>{Number(item.price || 0).toFixed(2)}</td>
						<td>{item.status || 'reserved'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<h2 style="margin-top: 24px">Conduces</h2>
	{#if data.conduces.length === 0}
		<p class="empty-state">Sin conduces registrados.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Número</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th>Receptor</th></tr>
			</thead>
			<tbody>
				{#each data.conduces as row (row.conduce.id)}
					<tr>
						<td><a href="/conduces/{row.conduce.id}">{row.conduce.note_number || `#${row.conduce.id}`}</a></td>
						<td>{row.conduce.conduce_type}</td>
						<td>{row.conduce.status}</td>
						<td>{row.conduce.date || '—'}</td>
						<td>{row.conduce.received_by_name || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<h2 style="margin-top: 24px">Incidencias</h2>
	{#if data.incidents.length === 0}
		<p class="empty-state">Sin incidencias.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Tipo</th><th>Severidad</th><th>Estado</th><th>Descripción</th><th>Costo est.</th></tr>
			</thead>
			<tbody>
				{#each data.incidents as incident (incident.id)}
					<tr>
						<td>{incident.type}</td>
						<td>{incident.severity || '—'}</td>
						<td>{incident.status}</td>
						<td>{incident.description}</td>
						<td>{Number(incident.estimated_cost || 0).toFixed(2)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<h2 style="margin-top: 24px">Movimientos de stock</h2>
	{#if data.stockMovements.length === 0}
		<p class="empty-state">Sin movimientos.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Tipo</th><th>Cantidad</th><th>Referencia</th><th>Fecha</th></tr>
			</thead>
			<tbody>
				{#each data.stockMovements as movement (movement.id)}
					<tr>
						<td>{movement.type}</td>
						<td>{movement.quantity}</td>
						<td>{movement.reference || '—'}</td>
						<td>{movement.created_at ? String(movement.created_at).slice(0, 19) : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
