import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCategoryRepository, getInventoryRepository } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudInventoryInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'inventory.create');
	const ctx = toTenantContext(companyId);
	const categories = await getCategoryRepository().list(ctx);
	return { categories };
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'inventory.create');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		// Sin cantidad inicial: un artículo NACE EN CERO y el stock entra por un
		// movimiento. El campo que había escribía cien sillas sin dejar rastro de
		// quién ni cuándo, y ese es justo el rastro que hace auditable un almacén.
		const values = {
			name: String(form.get('name') ?? '').trim(),
			internal_code: String(form.get('internal_code') ?? '').trim(),
			description: String(form.get('description') ?? '').trim(),
			category_id: String(form.get('category_id') ?? '').trim(),
			subcategory_id: String(form.get('subcategory_id') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			rental_price: Number(form.get('rental_price') ?? 0),
			internal_cost: Number(form.get('internal_cost') ?? 0)
		};

		const errors = validateCloudInventoryInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		const item = await getInventoryRepository().create(ctx, {
			name: values.name,
			internal_code: values.internal_code || undefined,
			description: values.description || undefined,
			category_id: values.category_id || '',
			subcategory_id: values.subcategory_id || undefined,
			notes: values.notes || undefined,
			rental_price: values.rental_price,
			internal_cost: values.internal_cost,
			is_active: 1
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.created',
			entity_type: 'inventory',
			entity_id: String(item.id),
			description: `Artículo creado: ${item.name}`
		});

		throw redirect(303, `/settings/articles/${item.id}`);
	}
};
