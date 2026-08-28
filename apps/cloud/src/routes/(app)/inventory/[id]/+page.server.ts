import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getCategoryRepository,
	getInventoryRepository,
	getSubcategoryRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudInventoryInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);
	const item = await getInventoryRepository().findById(ctx, params.id);
	if (!item) error(404, 'Artículo no encontrado');

	const [categories, subcategories, availability] = await Promise.all([
		getCategoryRepository().list(ctx),
		item.category_id ? getSubcategoryRepository().list(ctx, item.category_id) : Promise.resolve([]),
		getInventoryRepository().findAvailableByDateRange(ctx, { item_id: item.id })
	]);

	return {
		item,
		categories,
		subcategories,
		availability: availability[0] ?? null
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'inventory.update');
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

		const validationErrors = validateCloudInventoryInput(values);
		if (validationErrors.length) {
			return fail(400, { error: firstFormError(validationErrors), fieldErrors: formErrorsToObject(validationErrors) });
		}

		const current = await getInventoryRepository().findById(ctx, params.id);
		if (!current) error(404, 'Artículo no encontrado');

		const availableQuantity = Math.min(current.available_quantity ?? totalQuantity, totalQuantity);

		await getInventoryRepository().update(ctx, params.id, {
			name: values.name,
			internal_code: values.internal_code || undefined,
			description: values.description || undefined,
			category_id: values.category_id || '',
			subcategory_id: values.subcategory_id || undefined,
			notes: values.notes || undefined,
			status: values.status,
			total_quantity: totalQuantity,
			available_quantity: availableQuantity,
			rental_price: values.rental_price
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.updated',
			entity_type: 'inventory',
			entity_id: String(params.id),
			description: `Artículo actualizado: ${values.name}`
		});

		return { success: true };
	},
	deactivate: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'inventory.deactivate');
		const ctx = toTenantContext(companyId);
		const item = await getInventoryRepository().findById(ctx, params.id);
		if (!item) error(404, 'Artículo no encontrado');
		await getInventoryRepository().deactivate(ctx, params.id);
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.deactivated',
			entity_type: 'inventory',
			entity_id: String(params.id),
			description: `Artículo desactivado: ${item.name}`
		});
		throw redirect(303, '/inventory');
	}
};
