import {
	COMPANY_ROLES,
	PERMISSION_GROUPS,
	PERMISSION_LABELS,
	ROLE_DESCRIPTIONS,
	ROLE_LABELS,
	ROLE_PERMISSIONS
} from '@esr/core';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/permissions';

/**
 * Referencia de solo lectura: exporta `load` y NINGUNA action, que es el
 * marcador que ya usa /audit para decir que aqui no se escribe nada.
 *
 * La matriz se arma en el servidor a partir de `ROLE_PERMISSIONS`, la misma
 * constante que autoriza de verdad. Copiarla a mano en la pantalla la dejaria
 * mintiendo en cuanto alguien tocase un permiso.
 */
export const load: PageServerLoad = ({ locals }) => {
	requirePermission(locals, 'settings.members.manage');

	const roles = COMPANY_ROLES.map((role) => ({
		role,
		label: ROLE_LABELS[role],
		description: ROLE_DESCRIPTIONS[role],
		total: ROLE_PERMISSIONS[role].length
	}));

	const grupos = PERMISSION_GROUPS.map((grupo) => ({
		label: grupo.label,
		permisos: grupo.permissions.map((permission) => ({
			permission,
			label: PERMISSION_LABELS[permission],
			// Un booleano por rol, en el mismo orden que `roles`.
			concedido: COMPANY_ROLES.map((role) => ROLE_PERMISSIONS[role].includes(permission))
		}))
	}));

	/** Lo que cada rol añade sobre el inmediatamente inferior. */
	const extras = COMPANY_ROLES.map((role, i) => {
		const anterior = COMPANY_ROLES[i + 1];
		const previos = anterior ? new Set<string>(ROLE_PERMISSIONS[anterior]) : new Set<string>();
		return {
			role,
			sobre: anterior ? ROLE_LABELS[anterior] : null,
			nuevos: ROLE_PERMISSIONS[role]
				.filter((p) => !previos.has(p))
				.map((p) => PERMISSION_LABELS[p])
		};
	});

	return { roles, grupos, extras };
};
