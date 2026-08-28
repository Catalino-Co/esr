<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Conduce {data.conduce.note_number || `#${data.conduce.id}`}</h1>
		<div class="page-header-actions">
			<a class="btn-secondary" href="/conduces/{data.conduce.id}/print" target="_blank" rel="noopener">Imprimir conduce</a>
			<a class="btn-secondary" href="/conduces">Volver</a>
		</div>
	</div>

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{data.conduce.conduce_type}</strong><span>Tipo</span></div>
		<div class="metric"><strong>{data.conduce.status}</strong><span>Estado</span></div>
		<div class="metric">
			<strong><a href="/work-orders/{data.conduce.work_order_id}">{data.order?.order_number || `#${data.conduce.work_order_id}`}</a></strong>
			<span>Orden</span>
		</div>
		<div class="metric"><strong>{data.conduce.received_by_name || '—'}</strong><span>Receptor</span></div>
	</div>

	{#if data.conduce.notes}
		<p><strong>Notas:</strong> {data.conduce.notes}</p>
	{/if}

	<h2>Artículos</h2>
	<table class="data-table">
		<thead>
			<tr><th>Artículo</th><th>Código</th><th>Cantidad</th><th>Estado</th></tr>
		</thead>
		<tbody>
			{#each data.items as item (item.id)}
				<tr>
					<td>{item.name || item.item_id}</td>
					<td>{item.internal_code || '—'}</td>
					<td>{item.quantity}</td>
					<td>{item.status || '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>
