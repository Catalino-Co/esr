<script>
	import { enhance } from '$app/forms';
	import { can } from '$lib/can';

	let { data, form } = $props();

	const pkg = $derived(data.pkg);
	const editable = $derived(can('packages.update'));

	const money = (v) =>
		Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	// El importe real del paquete sale de sus artículos al precio vigente; el
	// precio sugerido es solo orientativo.
	const realTotal = $derived(
		data.items.reduce((acc, line) => acc + Number(line.rental_price || 0) * Number(line.quantity || 0), 0)
	);
</script>

<section class="panel">
	<div class="page-header">
		<h1>{pkg.name}</h1>
		<a class="btn-secondary" href="/packages">Volver</a>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<div class="grid" style="margin-bottom: 16px">
		<div class="metric"><strong>{data.items.length}</strong><span>Artículos</span></div>
		<div class="metric"><strong>{money(realTotal)}</strong><span>Total a precio vigente</span></div>
		<div class="metric"><strong>{money(pkg.suggested_price)}</strong><span>Precio sugerido</span></div>
	</div>

	<form method="POST" action="?/update" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="name">Nombre *</label>
			<input id="name" name="name" value={pkg.name} required disabled={!editable} />
		</div>
		<div class="form-field">
			<label for="suggested_price">Precio sugerido</label>
			<input
				id="suggested_price"
				name="suggested_price"
				type="number"
				min="0"
				step="0.01"
				value={pkg.suggested_price ?? 0}
				disabled={!editable}
			/>
		</div>
		<div class="form-field full">
			<label for="description">Descripción</label>
			<input id="description" name="description" value={pkg.description ?? ''} disabled={!editable} />
		</div>
		<div class="form-field full">
			<label for="notes">Notas</label>
			<textarea id="notes" name="notes" rows="2" disabled={!editable}>{pkg.notes ?? ''}</textarea>
		</div>
		<div class="form-field full">
			{#if editable}
				<button type="submit" class="btn-primary">Guardar cambios</button>
			{:else}
				<p class="panel-hint">Su rol no permite editar paquetes.</p>
			{/if}
		</div>
	</form>
</section>

{#if editable}
	<section class="panel">
		<h2 class="sec-title">Agregar artículo</h2>
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
				<span class="form-field-label">&nbsp;</span>
				<button type="submit" class="btn-primary">Agregar</button>
			</div>
			<p class="panel-hint full">
				Si el artículo ya está en el paquete, se suma a la cantidad existente.
			</p>
		</form>
	</section>
{/if}

<section class="panel">
	<h2 class="sec-title">Contenido del paquete</h2>

	{#if data.items.length === 0}
		<p class="empty-state">
			El paquete está vacío. Agrega artículos para poder insertarlo en una cotización.
		</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Artículo</th>
					<th>Código</th>
					<th class="num">Cantidad</th>
					<th class="num">Precio unit.</th>
					<th class="num">Subtotal</th>
					<th class="num">Disponible</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.items as line (line.item_id)}
					{@const insuficiente = Number(line.available_quantity) < Number(line.quantity)}
					<tr>
						<td>{line.name}</td>
						<td>{line.internal_code || '—'}</td>
						<td class="num">
							{#if editable}
								<form method="POST" action="?/updateItem" class="linea" use:enhance>
									<input type="hidden" name="item_id" value={line.item_id} />
									<input name="quantity" type="number" min="1" value={line.quantity} class="qty" />
									<button type="submit" class="btn-link">Guardar</button>
								</form>
							{:else}
								{line.quantity}
							{/if}
						</td>
						<td class="num">{money(line.rental_price)}</td>
						<td class="num">{money(Number(line.rental_price || 0) * Number(line.quantity || 0))}</td>
						<td class="num" class:insuficiente>
							{line.available_quantity ?? 0}
						</td>
						<td>
							{#if editable}
								<form method="POST" action="?/removeItem" use:enhance>
									<input type="hidden" name="item_id" value={line.item_id} />
									<button type="submit" class="btn-link">Quitar</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if data.items.some((l) => Number(l.available_quantity) < Number(l.quantity))}
			<p class="panel-hint" style="margin-top: 12px">
				Hay artículos con menos disponibilidad que la cantidad del paquete. Se puede insertar igual
				en una cotización; la disponibilidad se comprueba al confirmar la orden.
			</p>
		{/if}
	{/if}
</section>

<style>
	.sec-title {
		margin: 0 0 var(--sp-4);
		font-size: var(--font-md);
		font-weight: 600;
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.linea {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	.qty {
		width: 72px;
		text-align: right;
	}

	.insuficiente {
		color: var(--text-warning);
		font-weight: 600;
	}

	.full {
		grid-column: 1 / -1;
	}
</style>
