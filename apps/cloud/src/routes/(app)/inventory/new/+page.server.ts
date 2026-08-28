import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCategoryRepository, getInventoryRepository } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudInventoryInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);
	const categories = await getCategoryRepository().list(ctx);
	return { categories };
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const totalQuantity = Number(form.get('total_quantity') ?? 0);
		const values = {
			name: String(form.get('name') ?? '').trim(),
			internal_code: String(form.get('internal_code') ?? '').trim(),
			description: String(form.get('description') ?? '').trim(),
			category_id: String(form.get('category_id') ?? '').trim(),
			subcategory_id: String(form.get('subcategory_id') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			status: String(form.get('status') ?? 'disponible').trim(),
			total_quantity: totalQuantity,
			rental_price: Number(form.get('rental_price') ?? 0)
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
			status: values.status,
			total_quantity: totalQuantity,
			available_quantity: totalQuantity,
			rental_price: values.rental_price,
			is_active: 1
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.created',
			entity_type: 'inventory',
			entity_id: String(item.id),
			description: `Artículo creado: ${item.name}`
		});

		throw redirect(303, `/inventory/${item.id}`);
	}
};
