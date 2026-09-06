import { fail } from '@sveltejs/kit';
import { parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	getCategoryRepository,
	getInventoryRepository,
	getSubcategoryRepository,
	getSupplierRepository,
	getUnitOfMeasureRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudInventoryInput } from '$lib/server/validators';

/**
 * El CATALOGO de artículos: qué existe, cómo se llama, quién lo suministra y en
 * qué estado de circulación está.
 *
 * Separado de Inventario, que responde a otra pregunta —cuánto hay y dónde—.
 * Aquí viven el alta, la baja y el archivado; allí no, porque activar o
 * archivar cosas no es algo que se haga mirando existencias.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const categoryId = url.searchParams.get('category')?.trim() || undefined;
	const state = parseRecordState(url.searchParams.get('state'));

	const [items, categories, subcategories, suppliers, units] = await Promise.all([
		getInventoryRepository().list(ctx, { search, state, category_id: categoryId, limit: 200, offset: 0 }),
		getCategoryRepository().list(ctx),
		// Sin `categoryId`: trae las de TODA la empresa de una vez, para que el
		// modal de alta filtre en el cliente segun la categoria elegida sin un
		// segundo viaje al servidor por cada cambio de select.
		getSubcategoryRepository().list(ctx),
		getSupplierRepository().list(ctx),
		getUnitOfMeasureRepository().list(ctx)
	]);

	const categoryMap = new Map(categories.map((c) => [String(c.id), c.name]));
	const supplierMap = new Map(suppliers.map((s) => [String(s.id), s.name]));
	const unitMap = new Map(units.map((u) => [String(u.id), u.abbr || u.name]));

	return {
		items: items.map((item) => ({
			...item,
			category_name: item.category_id ? categoryMap.get(String(item.category_id)) ?? '—' : '—',
			supplier_name: item.supplier_id ? supplierMap.get(String(item.supplier_id)) ?? '—' : '—',
			uom_abbr: item.uom_id ? unitMap.get(String(item.uom_id)) ?? '' : ''
		})),
		categories,
		subcategories,
		suppliers,
		units,
		search: search ?? '',
		state,
		categoryId: categoryId ?? ''
	};
};

export const actions: Actions = {
	/**
	 * Alta de artículo desde el modal del listado.
	 *
	 * Vivía en `settings/articles/new/+page.server.ts`, una ruta propia que
	 * redirigía a la ficha al terminar. Aquí no se puede redirigir desde el
	 * servidor: el modal usa `use:enhance` con su propio callback, y es el
	 * cliente quien cierra el diálogo y navega tras el éxito.
	 */
	create: async ({ request, locals, getClientAddress }) => {
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
			internal_cost: Number(form.get('internal_cost') ?? 0),
			supplier_id: String(form.get('supplier_id') ?? '').trim(),
			uom_id: String(form.get('uom_id') ?? '').trim()
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
			supplier_id: values.supplier_id || null,
			uom_id: values.uom_id || null,
			is_active: 1
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.created',
			entity_type: 'inventory',
			entity_id: String(item.id),
			description: `Artículo creado: ${item.name}`
		});

		return { success: true, id: item.id };
	}
};
