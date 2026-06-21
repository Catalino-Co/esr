<script>
	let { data } = $props();
</script>

<section class="panel">
	<div class="page-header">
		<h1>Conduces</h1>
	</div>

	{#if data.conduces.length === 0}
		<p class="empty-state">Sin conduces registrados.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr><th>Número</th><th>Orden</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr>
			</thead>
			<tbody>
				{#each data.conduces as conduce (conduce.id)}
					<tr>
						<td><a href="/conduces/{conduce.id}">{conduce.note_number || `#${conduce.id}`}</a></td>
						<td><a href="/work-orders/{conduce.work_order_id}">#{conduce.work_order_id}</a></td>
						<td>{conduce.conduce_type}</td>
						<td>{conduce.status}</td>
						<td>{conduce.date || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
