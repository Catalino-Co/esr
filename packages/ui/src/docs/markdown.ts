import { Marked, type Tokens } from 'marked';

export type DocTopic = { id: string; title: string };
export type RenderedDoc = { html: string; topics: DocTopic[] };

/**
 * Convierte un titulo en un ancla estable:
 * "Modulos de la app" -> "modulos-de-la-app".
 */
export function slugifyHeading(text: string): string {
	return String(text)
		.normalize('NFD')
		// Quita los diacriticos que NFD acaba de separar (U+0300-U+036F).
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Markdown a HTML, extrayendo los encabezados de nivel 2 como temas.
 *
 * El indice "En esta pagina" sale de aqui, de modo que nunca queda
 * desincronizado del texto.
 *
 * Vive en un paquete compartido porque Cloud y Desktop renderizan su manual
 * igual; lo que cambia es el contenido, que cada app carga por su cuenta.
 */
export function renderMarkdown(source: string): RenderedDoc {
	const topics: DocTopic[] = [];
	const used = new Set<string>();
	const marked = new Marked({ gfm: true });

	marked.use({
		renderer: {
			heading(this: { parser: { parseInline: (tokens: Tokens.Heading['tokens']) => string } }, token: Tokens.Heading) {
				const title = this.parser.parseInline(token.tokens);
				// El id sale del texto plano, no del HTML, para que no arrastre etiquetas.
				let id = slugifyHeading(token.text);
				// Dos encabezados con el mismo texto no pueden compartir ancla.
				let suffix = 2;
				while (used.has(id)) id = `${slugifyHeading(token.text)}-${suffix++}`;
				used.add(id);

				if (token.depth === 2) topics.push({ id, title: token.text });

				return `<h${token.depth} id="${id}">${title}</h${token.depth}>\n`;
			}
		}
	});

	return { html: String(marked.parse(String(source || ''))).trim(), topics };
}
