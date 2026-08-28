import { renderMarkdown } from '@esr/ui/docs/markdown';

/**
 * El contenido del manual vive en archivos Markdown (lib/docs/content/*.md),
 * uno por seccion, para poder escribirlo y revisarlo como texto plano.
 *
 * Los archivos empiezan en `##`: el titulo de la seccion ya lo pinta la pagina
 * a partir del indice. El TOC "En esta pagina" se deriva de esos encabezados,
 * asi que nunca queda desincronizado del texto.
 */

// Vite inlina cada .md como string en el bundle, asi que el manual funciona sin
// pedirle nada al servidor. El glob tiene que vivir en la app porque la ruta es
// relativa a este archivo; el renderizador, que si es comun, esta en @esr/ui.
/** @type {Record<string, string>} */
const files = import.meta.glob('./content/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

const bySlug = new Map(
	Object.entries(files).map(([path, source]) => [
		path.replace('./content/', '').replace('.md', ''),
		source
	])
);

const rendered = new Map();

/**
 * Contenido ya renderizado de una seccion, o null si todavia no se ha escrito.
 * @param {string} slug
 * @returns {{ html: string, topics: Array<{id: string, title: string}> }|null}
 */
export function getDocContent(slug) {
	if (!bySlug.has(slug)) return null;
	if (!rendered.has(slug)) rendered.set(slug, renderMarkdown(bySlug.get(slug) ?? ''));
	return rendered.get(slug);
}

/**
 * Indica si una seccion ya tiene contenido escrito.
 * @param {string} slug
 */
export function hasDocContent(slug) {
	return bySlug.has(slug);
}
