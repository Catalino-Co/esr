import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * El alta de artículos se mudó a Configuración › Artículos.
 *
 * La ruta vieja se queda redirigiendo en vez de desaparecer: hay enlaces a ella
 * en pantallas que aún no se han rehecho, y un 404 sería peor que un salto.
 * `301` porque la mudanza es definitiva.
 */
export const load: PageServerLoad = () => {
	redirect(301, '/settings/articles/new');
};
