<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Icon } from '@esr/ui';
	import Modal from '$lib/components/Modal.svelte';
	import { toasts } from '$lib/stores/toasts';

	let { form } = $props();

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	let confirmando = $state(false);
	let confirmText = $state('');
	let password = $state('');
	let errorConfirmar = $state(null);

	function abrirConfirmar() {
		confirmText = '';
		password = '';
		errorConfirmar = null;
		confirmando = true;
	}
	function cerrarConfirmar() {
		confirmando = false;
		errorConfirmar = null;
	}

	const puedeConfirmar = $derived(confirmText === 'RESET' && password.length > 0);

	const alConfirmar = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success' && result.data?.success) {
			cerrarConfirmar();
			toasts.success('Reinicio de fábrica completado.');
			return;
		}
		errorConfirmar = result.data?.error ?? 'No se pudo completar el reinicio.';
	};
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar"
			title="Recargar"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>
</div>

<section class="panel">
	<div class="danger-box">
		<div class="danger-box-icon" aria-hidden="true">⚠️</div>
		<div class="danger-box-text">
			<strong>Zona de peligro</strong>
			<p>Acciones irreversibles — úselas con precaución.</p>
		</div>
	</div>

	<div class="danger-item">
		<div class="danger-item-text">
			<strong>Reinicio de fábrica</strong>
			<p>
				Elimina artículos, categorías, subcategorías, almacenes, tipos de evento, colaboradores,
				sectores comerciales, tipos de dirección, proveedores, auditoría, movimientos de
				inventario, clientes, eventos, cotizaciones, órdenes, conduces, facturas, incidencias y
				paquetes. Los usuarios y roles se conservan.
			</p>
		</div>
		<button type="button" class="btn-danger" onclick={abrirConfirmar}>🗑️ Reiniciar sistema</button>
	</div>
</section>

<Modal bind:open={confirmando} size="sm" title="¿Estás seguro?" onclose={cerrarConfirmar}>
	{#if errorConfirmar}
		<div class="alert-error" role="alert">{errorConfirmar}</div>
	{/if}

	<p class="panel-hint">
		Esta acción <strong>no se puede deshacer</strong>. Se eliminarán permanentemente:
	</p>
	<ul class="danger-list">
		<li>Artículos, categorías, subcategorías, almacenes y proveedores</li>
		<li>Tipos de evento, colaboradores, sectores comerciales y tipos de dirección</li>
		<li>Clientes, eventos, cotizaciones, órdenes, conduces, facturas, incidencias y paquetes</li>
		<li>Auditoría y movimientos de inventario</li>
	</ul>
	<p class="panel-hint">
		Se conservan los datos de la empresa, las unidades de medida, los usuarios y los roles y
		permisos.
	</p>

	<form id="reset-form" method="POST" action="?/factoryReset" class="form-grid" use:enhance={alConfirmar}>
		<div class="form-field full">
			<label for="confirmText">Escribe RESET para confirmar</label>
			<input
				id="confirmText"
				name="confirmText"
				bind:value={confirmText}
				autocomplete="off"
				placeholder="RESET"
			/>
		</div>
		<div class="form-field full">
			<label for="password">Ingresa tu contraseña</label>
			<input
				id="password"
				name="password"
				type="password"
				bind:value={password}
				autocomplete="current-password"
			/>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarConfirmar}>Cancelar</button>
		<button type="submit" form="reset-form" class="btn-danger" disabled={!puedeConfirmar}>
			🗑️ Confirmar reinicio
		</button>
	{/snippet}
</Modal>

<style>
	.danger-box {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-4);
		margin-bottom: var(--sp-5);
		border: 1px solid var(--danger);
		background: var(--danger-bg);
		border-radius: var(--border-radius);
	}

	.danger-box-icon {
		font-size: 1.3rem;
		line-height: 1;
	}

	.danger-box-text strong {
		display: block;
		color: var(--danger-text);
		margin-bottom: 2px;
	}

	.danger-box-text p {
		margin: 0;
		font-size: var(--font-sm);
		color: var(--danger-text);
	}

	.danger-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
	}

	.danger-item-text strong {
		display: block;
		margin-bottom: 4px;
	}

	.danger-item-text p {
		margin: 0;
		font-size: var(--font-sm);
		color: var(--text-secondary);
		max-width: 60ch;
	}

	.danger-list {
		margin: 0 0 var(--sp-3);
		padding-left: 1.2rem;
		font-size: var(--font-sm);
		color: var(--text-secondary);
		line-height: 1.6;
	}
</style>
