<script>
	import { enhance } from '$app/forms';
	import { can } from '$lib/can';

	let { data, form } = $props();

	const money = (v) =>
		Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<section class="panel">
	<div class="page-header">
		<h1>Paquetes</h1>
	</div>

	<p class="panel-hint">
		Agrupan artículos que se alquilan juntos. Desde una cotización se insertan de una vez y se
		explotan en sus líneas, con el precio vigente de cada artículo.
	</p>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	{#if can('packages.create')}
		<form method="POST" action="?/create" class="form-grid" use:enhance>
			<div class="form-field">
				<label for="name">Nombre *</label>
				<input id="name" name="name" required placeholder="Paquete básico de sonido" />
			</div>
			<div class="form-field">
				<label for="suggested_price">Precio sugerido</label>
				<input id="suggested_price" name="suggested_price" type="number" min="0" step="0.01" value="0" />
			</div>
			<div class="form-field full">
				<label for="description">Descripción</label>
				<input id="description" name="description" />
			</div>
			<div class="form-field full">
				<button type="submit" class="btn-primary">Crear paquete</button>
			</div>
		</form>
	{/if}
</section>

<section class="panel">
	<h2 class="sec-title">Registrados ({data.packages.length})</h2>

	{#if data.packages.length === 0}
		<p class="empty-state">Todavía no hay paquetes. Crea el primero arriba.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Nombre</th>
					<th>Descripción</th>
					<th class="num">Artículos</th>
					<th class="num">Precio sugerido</th>
					<th>Estado</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.packages as pkg (pkg.id)}
					{@const activo = pkg.is_active === 1}
					<tr class:fila-inactiva={!activo}>
						<td>{pkg.name}</td>
						<td>{pkg.description || '—'}</td>
						<td class="num">{pkg.item_count}</td>
						<td class="num">{money(pkg.suggested_price)}</td>
						<td>
							<span class="badge" class:badge-active={activo} class:badge-inactive={!activo}>
								{activo ? 'Activo' : 'Inactivo'}
							</span>
						</td>
						<td class="acciones">
							<a href="/packages/{pkg.id}">Ver</a>
							{#if can('packages.deactivate')}
								<form method="POST" action="?/toggle" use:enhance>
									<input type="hidden" name="id" value={pkg.id} />
									<input type="hidden" name="is_active" value={activo ? '0' : '1'} />
									<button type="submit" class={activo ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
										{activo ? 'Desactivar' : 'Reactivar'}
									</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
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

	.acciones {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.fila-inactiva td {
		opacity: 0.6;
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}
</style>
