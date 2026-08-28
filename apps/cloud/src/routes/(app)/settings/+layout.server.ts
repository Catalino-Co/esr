import { requireCompany } from '$lib/server/require-auth';
import type { LayoutServerLoad } from './$types';

/**
 * `/settings` esta abierto a cualquier miembro con empresa activa: su
 * contenido base es Apariencia, una preferencia personal. Las subsecciones
 * sensibles (empresa, miembros) exigen su propio permiso en su `load`.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	requireCompany(locals);
	return {};
};
