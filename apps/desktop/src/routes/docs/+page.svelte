<script>
	import { docsGroups } from '$lib/docs/sections.js';
	import { hasDocContent } from '$lib/docs/content.js';
</script>

<svelte:head><title>Documentación — ESR Pro</title></svelte:head>

<div class="card">
	<div class="card-title"><span>Manual de usuario</span></div>
	<p class="docs-lead">
		Guía de cada módulo de ESR Pro. Elige una sección para empezar.
	</p>

	{#each docsGroups as group (group.label)}
		<section class="docs-group">
			<h2 class="docs-group-title">{group.label}</h2>
			<div class="docs-card-grid">
				{#each group.sections as section (section.slug)}
					<a href={`/docs/${section.slug}`} class="docs-card">
						<span class="docs-card-icon" aria-hidden="true">{section.icon}</span>
						<span class="docs-card-body">
							<span class="docs-card-title">
								{section.title}
								{#if !hasDocContent(section.slug)}
									<span class="badge badge-muted">En redacción</span>
								{/if}
							</span>
							<span class="docs-card-desc">{section.summary}</span>
						</span>
						<span class="docs-card-arrow" aria-hidden="true">›</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.docs-lead {
		font-size: var(--font-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.docs-group {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		margin-top: var(--sp-6);
	}

	.docs-group-title {
		font-size: var(--font-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin: 0;
	}

	.docs-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--sp-4);
	}

	.docs-card {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-4);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		color: inherit;
		transition: all var(--transition-fast);
	}

	.docs-card:hover {
		border-color: var(--border-focus);
		background: var(--bg-hover);
	}

	.docs-card-icon {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: var(--bg-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.docs-card-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.docs-card-title {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--font-base);
		font-weight: 600;
		color: var(--text-primary);
	}

	.docs-card-desc {
		font-size: var(--font-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.docs-card-arrow {
		font-size: 1.5rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}
</style>
