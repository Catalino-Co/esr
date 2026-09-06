<script>
	import { enhance } from '$app/forms';
	import { dangerModal } from '$lib/stores/dangerModal';

	/**
	 * Los proveedores registrados de UN artículo. `items.supplier_id` era uno
	 * solo; un artículo puede comprarse a varios, y esta tarjeta es la lista
	 * —igual de simple que el directorio de direcciones de Cliente— con uno
	 * marcado como el preferido de este artículo en particular.
	 */
	let {
		itemSuppliers = [],
		suppliers = [],
		readOnly = false,
		form = null
	} = $props();

	const mensaje = $derived(form?.scope === 'proveedores' ? form : null);

	$effect(() => {
		if (mensaje?.error) dangerModal.show(mensaje.error);
	});

	/** Los que faltan por agregar: el select no repite los que ya están. */
	const disponibles = $derived(
		suppliers.filter((s) => !itemSuppliers.some((it) => String(it.supplier_id) === String(s.id)))
	);

	let mostrandoAgregar = $state(false);
	function alternarAgregar() {
		mostrandoAgregar = !mostrandoAgregar;
	}

	const alEnviar = () => async ({ update }) => {
		await update({ reset: false });
		mostrandoAgregar = false;
	};
</script>

<section class="panel">
	<div class="book-header">
		<div>
			<h2>Proveedores</h2>
			<p class="panel-hint">Quién suministra este artículo. Puede haber más de uno.</p>
		</div>
		{#if disponibles.length > 0 && !readOnly}
			<button type="button" class="btn-primary btn-new btn-sm" onclick={alternarAgregar}>
				Agregar proveedor
			</button>
		{/if}
	</div>

	{#if mostrandoAgregar}
		<form method="POST" action="?/addSupplier" class="sunken-card inline-form" use:enhance={alEnviar}>
			<div class="form-field">
				<label for="add-supplier">Proveedor</label>
				<select id="add-supplier" name="supplier_id" required>
					{#each disponibles as proveedor (proveedor.id)}
						<option value={proveedor.id}>{proveedor.name}</option>
					{/each}
				</select>
			</div>
			<label class="inherit-check">
				<input type="checkbox" name="is_primary" value="1" checked={itemSuppliers.length === 0} />
				Marcar como principal
			</label>
			<div class="form-field form-field--action">
				<button type="submit" class="btn-primary btn-sm">Agregar</button>
			</div>
		</form>
	{/if}

	{#if itemSuppliers.length === 0}
		<p class="empty-state">Todavía no hay proveedores registrados para este artículo.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Proveedor</th>
					<th>Principal</th>
					<th><span class="sr-only">Acciones</span></th>
				</tr>
			</thead>
			<tbody>
				{#each itemSuppliers as fila (fila.supplier_id)}
					<tr>
						<td>{fila.supplier_name}</td>
						<td>
							{#if fila.is_primary}
								<span class="chip chip-primary">★ Principal</span>
							{:else}
								—
							{/if}
						</td>
						<td class="row-actions">
							{#if !readOnly}
								{#if !fila.is_primary}
									<form method="POST" action="?/setPrimarySupplier" use:enhance={alEnviar}>
										<input type="hidden" name="supplier_id" value={fila.supplier_id} />
										<button type="submit" class="btn-secondary btn-sm">★ Principal</button>
									</form>
								{/if}
								<form method="POST" action="?/removeSupplier" use:enhance={alEnviar}>
									<input type="hidden" name="supplier_id" value={fila.supplier_id} />
									<button type="submit" class="btn-danger btn-sm">Quitar</button>
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
	.book-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.book-header h2 {
		margin: 0 0 4px;
		font-size: var(--font-lg);
	}

	.book-header .panel-hint {
		margin: 0;
	}

	.inline-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.inline-form .form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 10rem;
	}

	.inherit-check {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.inherit-check input {
		width: auto;
	}

	.chip {
		padding: 1px var(--sp-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.chip-primary {
		border-color: var(--accent-active);
		color: var(--accent-active);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
		white-space: nowrap;
	}
</style>
