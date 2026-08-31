import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * La ficha del artículo se mudó a Configuración › Artículos.
 *
 * Se conserva la redirección porque hay enlaces vivos a esta ruta —el listado
 * de Inventario, entre otros— hasta que la fase 2 los rehaga.
 */
export const load: PageServerLoad = ({ params }) => {
	redirect(301, `/settings/articles/${params.id}`);
};
