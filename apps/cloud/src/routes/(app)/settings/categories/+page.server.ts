import { fail } from '@sveltejs/kit';
import { RECORD_STATE, SELECTABLE_STATES } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { text } from '$lib/server/catalogs';
import { requirePermission } from '$lib/server/permissions';
import { getCategoryRepository, getSubcategoryRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Categorias y subcategorias no usan el helper generico de catalogos: las
 * subcategorias cuelgan de una categoria, asi que su unicidad y su formulario
 * dependen del padre.
 */

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const ctx = toTenantContext(companyId);
	// Igual que los demas catalogos: activos e inactivos juntos, porque el
	// boton Reactivar vive en la fila.
	const state = SELECTABLE_STATES;

	const [categories, subcategories] = await Promise.all([
		getCategoryRepository().list(ctx, { state }),
		getSubcategoryRepository().list(ctx, undefined, { state })
	]);

	return { categories, subcategories, state };
};

export const actions: Actions = {
	saveCategory: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const ctx = toTenantContext(companyId);

		const id = text(form, 'id');
		const name = text(form, 'name');
		const color = text(form, 'color') || '#6366f1';
		// `values` viaja en todo `fail`: el dialogo se re-renderiza al recibir la
		// respuesta y sin esto se quedaria vacio.
		const values = { name, color };
		if (!name) return fail(400, { error: 'El nombre de la categoría es obligatorio.', values });

		const duplicate = await getCategoryRepository().findByName(ctx, name);
		if (duplicate && String(duplicate.id) !== id) {
			return fail(400, { error: `Ya existe la categoría «${name}» en esta empresa.`, values });
		}

		const saved = id
			? await getCategoryRepository().update(ctx, id, { name, color, is_active: RECORD_STATE.ACTIVE })
			: await getCategoryRepository().create(ctx, { name, color, is_active: RECORD_STATE.ACTIVE });

		await recordAuditLog(event, {
			action: id ? 'settings.category.updated' : 'settings.category.created',
			entity_type: 'category',
			entity_id: String(saved.id),
			description: `Categoría ${id ? 'actualizada' : 'creada'}: ${saved.name}`
		});

		return { success: `«${saved.name}» ${id ? 'se actualizó' : 'se creó'} correctamente.` };
	},

	toggleCategory: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const ctx = toTenantContext(companyId);

		const id = text(form, 'id');
		const isActive = text(form, 'is_active') === '1' ? RECORD_STATE.ACTIVE : RECORD_STATE.INACTIVE;
		if (!id) return fail(400, { error: 'Falta el identificador.' });

		const categories = await getCategoryRepository().list(ctx, { state: SELECTABLE_STATES });
		const entry = categories.find((c) => String(c.id) === id);
		if (!entry) return fail(404, { error: 'Categoría no encontrada.' });

		// Al desactivar se avisa cuantos articulos la usan. No se bloquea: el
		// inventario historico debe conservar su categoria.
		const usages = isActive === RECORD_STATE.INACTIVE ? await getCategoryRepository().countUsages(ctx, id) : 0;

		await getCategoryRepository().setActive(ctx, id, isActive);

		await recordAuditLog(event, {
			action: isActive ? 'settings.category.reactivated' : 'settings.category.deactivated',
			entity_type: 'category',
			entity_id: id,
			description: `Categoría ${isActive ? 'reactivada' : 'desactivada'}: ${entry.name}`
		});

		const base = `«${entry.name}» ${isActive ? 'se reactivó' : 'se desactivó'}.`;
		return {
			success: usages > 0 ? `${base} Hay ${usages} artículo(s) que la usan; la conservan.` : base
		};
	},

	saveSubcategory: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const ctx = toTenantContext(companyId);

		const id = text(form, 'id');
		const categoryId = text(form, 'category_id');
		const name = text(form, 'name');
		const values = { category_id: categoryId, name };
		if (!categoryId) return fail(400, { error: 'Seleccione una categoría.', values });
		if (!name) return fail(400, { error: 'El nombre de la subcategoría es obligatorio.', values });

		const duplicate = await getSubcategoryRepository().findByName(ctx, categoryId, name);
		if (duplicate && String(duplicate.id) !== id) {
			return fail(400, { error: `Ya existe «${name}» en esa categoría.`, values });
		}

		const saved = id
			? await getSubcategoryRepository().update(ctx, id, {
					category_id: categoryId,
					name,
					is_active: RECORD_STATE.ACTIVE
				})
			: await getSubcategoryRepository().create(ctx, {
					category_id: categoryId,
					name,
					is_active: RECORD_STATE.ACTIVE
				});

		await recordAuditLog(event, {
			action: id ? 'settings.subcategory.updated' : 'settings.subcategory.created',
			entity_type: 'subcategory',
			entity_id: String(saved.id),
			description: `Subcategoría ${id ? 'actualizada' : 'creada'}: ${saved.name}`
		});

		return { success: `«${saved.name}» ${id ? 'se actualizó' : 'se creó'} correctamente.` };
	},

	toggleSubcategory: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const ctx = toTenantContext(companyId);

		const id = text(form, 'id');
		const isActive = text(form, 'is_active') === '1' ? RECORD_STATE.ACTIVE : RECORD_STATE.INACTIVE;
		if (!id) return fail(400, { error: 'Falta el identificador.' });

		const subcategories = await getSubcategoryRepository().list(ctx, undefined, {
			state: SELECTABLE_STATES
		});
		const entry = subcategories.find((s) => String(s.id) === id);
		if (!entry) return fail(404, { error: 'Subcategoría no encontrada.' });

		await getSubcategoryRepository().setActive(ctx, id, isActive);

		await recordAuditLog(event, {
			action: isActive ? 'settings.subcategory.reactivated' : 'settings.subcategory.deactivated',
			entity_type: 'subcategory',
			entity_id: id,
			description: `Subcategoría ${isActive ? 'reactivada' : 'desactivada'}: ${entry.name}`
		});

		return { success: `«${entry.name}» ${isActive ? 'se reactivó' : 'se desactivó'}.` };
	}
};
