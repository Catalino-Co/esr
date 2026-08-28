import { docsSections } from '$lib/docs/sections.js';

/**
 * ESR Pro se prerenderiza con `ssr: false`, asi que el rastreador de SvelteKit
 * no encuentra los enlaces del manual: no hay HTML del servidor que recorrer.
 * Se le entrega la lista explicitamente, derivada del mismo indice que pinta la
 * navegacion, de modo que agregar una seccion no obliga a tocar nada mas.
 */
export function entries() {
	return docsSections.map((section) => ({ slug: section.slug }));
}
