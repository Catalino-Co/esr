<script>
	import { page } from '$app/state';
	import { docsGroups } from '$lib/docs/sections.js';

	let { children } = $props();

	const pathname = $derived(page.url.pathname);
</script>

<div class="docs-shell">
	<aside class="docs-index" aria-label="Secciones del manual">
		<a href="/docs" class="docs-index-home" class:docs-index-home--active={pathname === '/docs'}>
			<span aria-hidden="true">📖</span>
			<span>Manual de usuario</span>
		</a>

		{#each docsGroups as group (group.label)}
			<div class="docs-index-group">
				<div class="docs-index-label">{group.label}</div>
				{#each group.sections as section (section.slug)}
					<a
						href={`/docs/${section.slug}`}
						class="docs-index-item"
						class:docs-index-item--active={pathname === `/docs/${section.slug}`}
					>
						<span class="docs-index-icon" aria-hidden="true">{section.icon}</span>
						<span class="docs-index-text">{section.title}</span>
					</a>
				{/each}
			</div>
		{/each}
	</aside>

	<div class="docs-content">
		{@render children()}
	</div>
</div>

<style>
	.docs-shell {
		display: flex;
		min-height: 100%;
		gap: var(--sp-5);
	}

	.docs-index {
		width: 260px;
		min-width: 260px;
		align-self: flex-start;
		position: sticky;
		top: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		background: var(--bg-surface);
		padding: var(--sp-4) 0;
	}

	.docs-index-home {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0 var(--sp-3) var(--sp-4);
		padding: var(--sp-3);
		border-radius: var(--border-radius-sm);
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-size: var(--font-sm);
		font-weight: 600;
	}

	.docs-index-home:hover {
		background: var(--bg-hover);
	}

	.docs-index-home--active {
		/* --text-brand y no --brand-primary: el primero aclara en tema oscuro;
		   el azul de marca fijo se pierde sobre la superficie oscura. */
		color: var(--text-brand);
	}

	.docs-index-group {
		margin-bottom: var(--sp-4);
	}

	.docs-index-label {
		padding: 0 var(--sp-4) var(--sp-1);
		font-size: var(--font-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.docs-index-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 6px var(--sp-4);
		color: var(--text-secondary);
		font-size: var(--font-sm);
		border-left: 2px solid transparent;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}

	.docs-index-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.docs-index-item--active {
		background: var(--bg-hover);
		color: var(--text-brand);
		border-left-color: var(--brand-primary);
		font-weight: 500;
	}

	.docs-index-icon {
		width: 18px;
		text-align: center;
		flex-shrink: 0;
	}

	.docs-index-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.docs-content {
		flex: 1;
		min-width: 0;
	}

	@media (max-width: 900px) {
		.docs-shell {
			flex-direction: column;
		}

		.docs-index {
			width: 100%;
			min-width: 0;
			position: static;
		}
	}
</style>
