import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getCompanySettingsRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Valores por defecto de operación.
 *
 * Separada de «Datos de la empresa» a propósito: aquella pantalla guarda lo que
 * se IMPRIME —nombre, RNC, dirección— y ésta lo que la aplicación PROPONE al
 * trabajar. Mezclarlas obligaría a que un cambio de tasa reescribiera el
 * membrete, que es justo lo que evita `updateDefaults`.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'settings.company.update');
	const settings = await getCompanySettingsRepository().get(toTenantContext(companyId));

	return {
		defaults: {
			default_tax_rate: Number(settings?.default_tax_rate ?? 0),
			default_valuation_rule: settings?.default_valuation_rule ?? 'ultimo'
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.company.update');
		const form = await request.formData();

		const bruto = String(form.get('default_tax_rate') ?? '').trim();
		const tasa = Number(bruto);
		// Solo dos reglas; cualquier otra cosa cae en la más simple. Una action es
		// un endpoint público y el <select> no la protege.
		const regla = String(form.get('default_valuation_rule') ?? '').trim() === 'promedio3'
			? 'promedio3'
			: 'ultimo';

		// `Number('')` es 0 y `Number('abc')` es NaN: los dos se rechazan aquí en
		// vez de acabar escribiendo un 0 silencioso. Una action es un endpoint
		// público y el `<input type="number">` no la protege.
		if (bruto === '' || !Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
			return fail(400, {
				error: 'El impuesto debe ser un porcentaje entre 0 y 100.',
				values: { default_tax_rate: bruto, default_valuation_rule: regla }
			});
		}

		await getCompanySettingsRepository().updateDefaults(toTenantContext(companyId), {
			default_tax_rate: tasa,
			default_valuation_rule: regla
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'settings.company.updated',
			entity_type: 'company_settings',
			entity_id: companyId,
			description: `Impuesto por defecto ${tasa}%, valoración «${regla}»`
		});

		return {
			success: 'Ajustes generales guardados.',
			values: { default_tax_rate: String(tasa), default_valuation_rule: regla }
		};
	}
};
