<script>
	import { visibleSettingsSections } from '$lib/settings-sections';

	let { data } = $props();

	const visible = $derived(visibleSettingsSections(data.permissions));
</script>

{#if visible.length}
	<div class="settings-cards">
		{#each visible as section (section.href)}
			<a class="settings-card" href={section.href}>
				<span class="settings-card-icon" aria-hidden="true">{section.icon}</span>
				<span class="settings-card-text">
					<strong>{section.title}</strong>
					<span class="settings-card-desc">{section.description}</span>
				</span>
			</a>
		{/each}
	</div>
{:else}
	<section class="panel">
		<p class="settings-empty">Su rol no tiene secciones de configuración disponibles.</p>
	</section>
{/if}

<style>
	/* Las tarjetas van sueltas sobre el fondo de la pagina, no dentro de un
	   `.panel`: un panel blanco lleno de tarjetas blancas no aporta borde
	   ninguno y solo resta ancho. */
	.settings-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--sp-4);
	}

	.settings-card {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.settings-card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-md);
	}

	.settings-card:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: var(--focus-ring);
	}

	/* El icono se apoya en --accent-subtle, no en --accent: el acento solido
	   ya lo lleva el item activo del menu, y repetido en siete fichas dejaria
	   de senalar nada. */
	.settings-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: var(--radius);
		background: var(--accent-subtle);
		font-size: 1.15rem;
		line-height: 1;
	}

	.settings-card-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.settings-card strong {
		font-size: var(--font-md);
		color: var(--text-primary);
	}

	.settings-card-desc {
		font-size: var(--font-sm);
		color: var(--text-muted);
		line-height: 1.5;
	}

	.settings-empty {
		color: var(--text-muted);
		margin: 0;
	}
</style>
