<script>
	import { onMount } from 'svelte';
	import { ICONS } from '@esr/ui/icons';
	import { theme } from '$lib/stores/theme';

	// El servidor siempre renderiza el tema claro (no conoce localStorage).
	// Marcar el activo antes de montar produciria un desajuste de hidratación
	// para quien tenga el oscuro guardado, así que se espera al cliente.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const options = [
		{ value: 'light', label: 'Claro', icon: ICONS.themeLight },
		{ value: 'dark', label: 'Oscuro', icon: ICONS.themeDark }
	];
</script>

<section class="panel">
	<div class="page-header">
		<h1>Apariencia</h1>
		<a class="btn-secondary" href="/settings">Volver</a>
	</div>

	<p class="panel-hint">
		Elige el tema visual de la aplicación. El cambio se aplica de inmediato y se recuerda en este
		navegador.
	</p>

	<div class="theme-options">
		{#each options as option (option.value)}
			<button
				type="button"
				class="theme-option"
				class:active={mounted && $theme === option.value}
				aria-pressed={mounted && $theme === option.value}
				onclick={() => theme.set(option.value)}
			>
				<span class="theme-preview theme-preview--{option.value}">
					<span class="tp-sidebar"></span>
					<span class="tp-content">
						<span class="tp-bar"></span>
						<span class="tp-bar short"></span>
					</span>
				</span>
				<span class="theme-label">{option.icon} {option.label}</span>
				<span class="theme-state">{mounted && $theme === option.value ? 'Activo' : ' '}</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.theme-options {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.theme-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-4);
		border: 2px solid var(--border);
		border-radius: var(--border-radius);
		background: var(--bg-elevated);
		cursor: pointer;
		transition: all var(--transition-fast);
		min-width: 140px;
	}

	.theme-option:hover {
		border-color: var(--border-focus);
		background: var(--bg-hover);
	}

	.theme-option.active {
		border-color: var(--brand-primary);
		background: var(--bg-hover);
	}

	.theme-label {
		font-size: var(--font-sm);
		font-weight: 500;
		color: var(--text-primary);
	}

	.theme-state {
		font-size: var(--font-xs);
		font-weight: 600;
		color: var(--brand-primary);
		min-height: 1em;
	}

	/* Miniatura del tema: se pinta con colores literales a proposito,
	   para que cada tarjeta muestre SU tema y no el que esta activo. */
	.theme-preview {
		width: 96px;
		height: 60px;
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		border: 1px solid var(--border);
	}

	.theme-preview--light {
		background: #f0f4f8;
	}
	.theme-preview--dark {
		background: #0f172a;
	}

	.tp-sidebar {
		width: 26px;
		height: 100%;
		flex-shrink: 0;
		background: #1a2744;
	}

	.tp-content {
		flex: 1;
		padding: 8px 6px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.tp-bar {
		height: 7px;
		border-radius: 3px;
		display: block;
	}

	.tp-bar.short {
		width: 60%;
	}

	.theme-preview--light .tp-bar {
		background: #cbd5e1;
	}
	.theme-preview--dark .tp-bar {
		background: #1e3a5f;
	}
</style>
