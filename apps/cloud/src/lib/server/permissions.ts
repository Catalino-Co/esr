import { error } from '@sveltejs/kit';
import { can, permissionsForRole, type Permission } from '@esr/core';
import { requireCompany } from './require-auth';

export type { Permission };

/**
 * Puerta de autorizacion server-side.
 *
 * El rol se toma siempre de `locals` (resuelto en `hooks.server.ts` contra
 * `company_members`), nunca de un formulario. Ocultar un boton en la UI es una
 * cortesia; esta funcion es la barrera real.
 */
export function requirePermission(locals: App.Locals, permission: Permission) {
	const context = requireCompany(locals);
	if (!can(context.role, permission)) {
		throw error(403, 'No tiene permiso para realizar esta accion.');
	}
	return context;
}

/** Permisos efectivos de la sesion actual, para enviarlos al cliente. */
export function sessionPermissions(locals: App.Locals): Permission[] {
	return permissionsForRole(locals.role);
}
