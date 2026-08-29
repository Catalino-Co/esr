<script>
	import { enhance } from '$app/forms';
	import { RECORD_STATE, RECORD_STATE_LABELS, RECORD_STATES } from '@esr/core';

	/**
	 * Control de estado de circulación de las pantallas de detalle.
	 *
	 * Vive solo aquí, no en las filas de la lista: cambiar el estado es una
	 * decisión sobre un registro concreto, y llenar cada fila de una tabla con
	 * botones fue justamente lo que dejó las pantallas como estaban.
	 */
	let {
		/** Valor actual: 0 archivado, 1 activo, 2 inactivo. */
		state,
		/** Nombre de la action del formulario, p. ej. `?/setState`. */
		action = '?/setState',
		/** Si es false se muestra solo el badge, sin poder cambiarlo. */
		editable = true,
		/** Qué se está archivando, para el texto de ayuda. */
		noun = 'registro'
	} = $props();

	const current = $derived(Number(state));

	const helpText = $derived(
		current === RECORD_STATE.ARCHIVED
			? `Este ${noun} está archivado: no aparece en los listados ni en los selectores.`
			: current === RECORD_STATE.INACTIVE
				? `Este ${noun} está en pausa: sigue disponible con aviso, pero fuera de los listados por defecto.`
				: `Este ${noun} está activo y disponible en toda la aplicación.`
	);
</script>

<div class="state-control">
	<div class="state-current">
		<span class="state-label">Estado</span>
		<span
			class="badge"
			class:badge-active={current === RECORD_STATE.ACTIVE}
			class:badge-warning={current === RECORD_STATE.INACTIVE}
			class:badge-inactive={current === RECORD_STATE.ARCHIVED}
		>
			{RECORD_STATE_LABELS[current] ?? '—'}
		</span>
	</div>

	{#if editable}
		<form method="POST" {action} class="state-form" use:enhance>
			<label class="sr-only" for="record-state">Cambiar estado</label>
			<select id="record-state" name="state">
				{#each RECORD_STATES as option (option)}
					<option value={option} selected={option === current}>
						{RECORD_STATE_LABELS[option]}
					</option>
				{/each}
			</select>
			<button type="submit" class="btn-secondary btn-sm">Cambiar</button>
		</form>
	{/if}

	<p class="state-help">{helpText}</p>
</div>

<style>
	.state-control {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		background: var(--bg-elevated);
		margin-bottom: var(--sp-4);
	}

	.state-current {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.state-label {
		font-size: var(--font-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.state-form {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.state-form select {
		padding: var(--sp-1) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-surface);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--font-sm);
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}

	/* Ocupa toda la fila para no empujar los controles. */
	.state-help {
		flex: 1 1 100%;
		margin: 0;
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
