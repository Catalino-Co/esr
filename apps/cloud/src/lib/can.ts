import { page } from '$app/state';
import { hasPermission, type Permission } from '@esr/core';

/**
 * Guardia de UI: oculta lo que el rol no puede ejecutar.
 *
 * Es solo cosmetica. La barrera real vive en `requirePermission` del servidor,
 * que se evalua en cada `load` y cada action.
 */
export function can(permission: Permission): boolean {
	return hasPermission(page.data.permissions, permission);
}
