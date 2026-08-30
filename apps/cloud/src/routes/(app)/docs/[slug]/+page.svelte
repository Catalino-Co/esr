<script>
	import { page } from '$app/state';
	import { getSection, getSiblings } from '$lib/docs/sections.js';
	import { getDocContent } from '$lib/docs/content.js';

	const slug = $derived(page.params.slug);
	const section = $derived(getSection(slug));
	const siblings = $derived(getSiblings(slug));
	const content = $derived(getDocContent(slug));
	// Con contenido escrito el TOC sale de los encabezados del Markdown; sin él,
	// del esquema declarado en el índice.
	const topics = $derived(content ? content.topics : (section?.topics ?? []));
</script>

<svelte:head>
	<title>{section ? `${section.title} — Documentación` : 'Sección no encontrada'} — ESR Cloud</title>
</svelte:head>

{#if !section}
	<section class="panel">
		<div class="page-header">
			<h1>Sección no encontrada</h1>
		</div>
		<div class="alert-error" role="alert">
			La sección «{slug}» no existe en el manual. <a href="/docs">Volver al índice</a>
		</div>
	</section>
{:else}
	<div class="doc-layout">
		<article class="panel doc-article">
			<nav class="doc-breadcrumb" aria-label="Ruta de navegación">
				<a href="/docs">Manual</a>
				<span aria-hidden="true">›</span>
				<span>{section.group}</span>
				<span aria-hidden="true">›</span>
				<span>{section.title}</span>
			</nav>

			<div class="page-header">
				<h1><span class="doc-title-icon" aria-hidden="true">{section.icon}</span> {section.title}</h1>
			</div>
			<p class="panel-hint">{section.summary}</p>

			{#if content}
				<!-- El HTML se genera al compilar desde un .md del propio repositorio;
				     no hay entrada de usuario en juego, así que no hay nada que sanear. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div class="doc-md">{@html content.html}</div>
			{:else}
				{#each topics as topic (topic.id)}
					<section class="doc-topic" id={topic.id}>
						<h2 class="doc-topic-title">{topic.title}</h2>
						<p class="doc-pending">Contenido pendiente de redacción.</p>
					</section>
				{/each}
			{/if}

			<div class="doc-siblings">
				{#if siblings.previous}
					<a class="doc-sibling" href={`/docs/${siblings.previous.slug}`}>
						<span class="doc-sibling-label">Anterior</span>
						<span class="doc-sibling-title">{siblings.previous.title}</span>
					</a>
				{:else}
					<span></span>
				{/if}
				{#if siblings.next}
					<a class="doc-sibling doc-sibling--next" href={`/docs/${siblings.next.slug}`}>
						<span class="doc-sibling-label">Siguiente</span>
						<span class="doc-sibling-title">{siblings.next.title}</span>
					</a>
				{/if}
			</div>
		</article>

		<aside class="doc-toc" aria-label="En esta página">
			<div class="doc-toc-title">En esta página</div>
			<ul class="doc-toc-list">
				{#each topics as topic (topic.id)}
					<li><a href={`#${topic.id}`}>{topic.title}</a></li>
				{/each}
			</ul>
		</aside>
	</div>
{/if}

<style>
	.doc-layout {
		display: flex;
		gap: var(--sp-5);
		align-items: flex-start;
	}

	.doc-article {
		flex: 1;
		min-width: 0;
		max-width: 900px;
	}

	.doc-breadcrumb {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--font-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
	}

	.doc-breadcrumb a {
		color: var(--text-brand);
	}

	.doc-title-icon {
		margin-right: var(--sp-2);
	}

	.doc-topic {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-5);
		/* El ancla no queda tapada al saltar desde el TOC. */
		scroll-margin-top: var(--sp-6);
	}

	.doc-topic-title {
		font-size: var(--font-lg);
		font-weight: 600;
		color: var(--text-primary);
		padding-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border);
		margin: 0;
	}

	.doc-pending {
		font-size: var(--font-sm);
		color: var(--text-muted);
		font-style: italic;
		margin: 0;
	}

	/* Markdown renderizado. Los selectores van con :global() porque el HTML lo
	   inyecta {@html} y Svelte no puede aplicarle sus clases scoped. */
	.doc-md {
		display: flex;
		flex-direction: column;
		font-size: var(--font-base);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.doc-md :global(h2) {
		font-size: var(--font-lg);
		font-weight: 600;
		color: var(--text-primary);
		margin-top: var(--sp-6);
		padding-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border);
		scroll-margin-top: var(--sp-4);
	}

	.doc-md :global(h2:first-child) {
		margin-top: 0;
	}

	.doc-md :global(h3) {
		font-size: var(--font-md);
		font-weight: 600;
		color: var(--text-primary);
		margin-top: var(--sp-5);
		scroll-margin-top: var(--sp-4);
	}

	.doc-md :global(p) {
		margin-top: var(--sp-3);
		color: var(--text-secondary);
	}

	.doc-md :global(strong) {
		color: var(--text-primary);
		font-weight: 600;
	}

	.doc-md :global(ul),
	.doc-md :global(ol) {
		margin: var(--sp-3) 0 0 var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.doc-md :global(a) {
		color: var(--text-brand);
	}

	.doc-md :global(a:hover) {
		text-decoration: underline;
	}

	.doc-md :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.875em;
		background: var(--bg-elevated);
		padding: 1px 5px;
		border-radius: var(--border-radius-sm);
		color: var(--text-primary);
	}

	.doc-md :global(pre) {
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		background: var(--bg-elevated);
		border-radius: var(--border-radius-sm);
		overflow-x: auto;
	}

	.doc-md :global(blockquote) {
		margin-top: var(--sp-3);
		padding: var(--sp-2) var(--sp-4);
		border-left: 3px solid var(--brand-primary);
		background: var(--bg-elevated);
		border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
	}

	/* Las tablas anchas hacen scroll dentro de su propio contenedor. */
	.doc-md :global(table) {
		display: block;
		overflow-x: auto;
		width: 100%;
		margin-top: var(--sp-4);
		border-collapse: collapse;
		font-size: var(--font-sm);
	}

	.doc-md :global(th),
	.doc-md :global(td) {
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.doc-md :global(th) {
		color: var(--text-primary);
		font-weight: 600;
		background: var(--bg-elevated);
		white-space: nowrap;
	}

	.doc-siblings {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
		margin-top: var(--sp-6);
		padding-top: var(--sp-4);
		border-top: 1px solid var(--border);
	}

	.doc-sibling {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		color: inherit;
		max-width: 45%;
	}

	.doc-sibling:hover {
		border-color: var(--border-focus);
		background: var(--bg-hover);
	}

	.doc-sibling--next {
		text-align: right;
		margin-left: auto;
	}

	.doc-sibling-label {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	.doc-sibling-title {
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-primary);
	}

	.doc-toc {
		width: 220px;
		min-width: 220px;
		position: sticky;
		top: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		background: var(--bg-surface);
	}

	.doc-toc-title {
		font-size: var(--font-xs);
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
	}

	.doc-toc-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin: 0;
		padding: 0;
	}

	.doc-toc-list a {
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.doc-toc-list a:hover {
		color: var(--text-brand);
	}

	@media (max-width: 1200px) {
		.doc-toc {
			display: none;
		}
	}
</style>
