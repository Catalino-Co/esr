import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { getFactoryResetService } from '$lib/server/repositories';
import { authRepository, verifyPassword } from '$lib/server/auth';

/**
 * Configuración › Zona de peligro.
 *
 * Solo `settings.factory_reset`, que hoy solo tiene `admin` -no hay rol por
 * encima (el `owner` se retiró en la migración 024)-. Doble confirmación:
 * escribir la palabra RESET y la contraseña propia, las dos revalidadas
 * aquí -lo que el cliente deshabilite no es una barrera.
 */
export const load: PageServerLoad = ({ locals }) => {
	requirePermission(locals, 'settings.factory_reset');
	return {};
};

export const actions: Actions = {
	factoryReset: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.factory_reset');
		const form = await event.request.formData();

		const confirmText = String(form.get('confirmText') ?? '');
		const password = String(form.get('password') ?? '');

		if (confirmText !== 'RESET') {
			return fail(400, { error: 'Escriba RESET, en mayúsculas, para confirmar.' });
		}
		if (!password) {
			return fail(400, { error: 'Ingrese su contraseña.' });
		}

		const userId = event.locals.user?.id;
		if (!userId) return fail(401, { error: 'Sesión inválida.' });

		const user = await authRepository().findUserById(userId);
		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return fail(400, { error: 'Contraseña incorrecta.' });
		}

		const ctx = toTenantContext(companyId);
		try {
			await getFactoryResetService().reset(ctx);
		} catch (err) {
			return fail(500, {
				error: err instanceof Error ? err.message : 'No se pudo completar el reinicio.'
			});
		}

		// Después del borrado, no antes: `audit_logs` quedó vacía y esta es la
		// primera fila que sobrevive, no una que el propio reinicio se coma.
		await recordAuditLog(event, {
			action: 'company.factory_reset',
			entity_type: 'company',
			entity_id: companyId,
			description: 'Reinicio de fábrica ejecutado: se borraron los datos operativos de la empresa.'
		});

		return { success: true };
	}
};
