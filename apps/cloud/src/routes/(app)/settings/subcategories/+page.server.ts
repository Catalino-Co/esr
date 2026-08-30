import { fail } from '@sveltejs/kit';
import { RECORD_STATE, SELECTABLE_STATES, isRecordState, parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { text } from '$lib/server/catalogs';
import { requirePermission } from '$lib/server/permissions';
import { getCategoryRepository, getSubcategoryRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Subcategorias. Salieron de /settings/categories a su propia pantalla: son
 * otra entidad, con su padre, su unicidad —el nombre solo tiene que ser unico
 * DENTRO de su categoria— y su propia tabla.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const ctx = toTenantContext(companyId);
	const state = parseRecordState(url.searchParams.get('state'));
	const search = url.searchParams.get('search') ?? '';
	const categoryId = url.searchParams.get('category') ?? '';

	const [subcategories, categories] = await Promise.all([
		getSubcategoryRepository().list(ctx, categoryId || undefined, { state }),
		// Todas las seleccionables: una subcategoria puede colgar de una
		// categoria pausada, y hay que poder verla y reasignarla.
		getCategoryRepository().list(ctx, { state: SELECTABLE_STATES })
	]);

	const porId = new Map(categories.map((c) => [String(c.id), c]));
	const conPadre = subcategories.map((sub) => ({
		...sub,
		category_name: porId.get(String(sub.category_id))?.name ?? '—',
		category_color: porId.get(String(sub.category_id))?.color ?? null
	}));

	// El repositorio no filtra por texto y la lista es corta: se filtra aqui.
	const termino = search.trim().toLowerCase();
	const filtradas = termino
		? conPadre.filter(
				(s) =>
					(s.name ?? '').toLowerCase().includes(termino) ||
					s.category_name.toLowerCase().includes(termino)
			)
		: conPadre;

	return { subcategories: filtradas, categories, state, search, categoryId };
};

export const actions: Actions = {
	save: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const ctx = toTenantContext(companyId);

		const id = text(form, 'id');
		const categoryId = text(form, 'category_id');
		const name = text(form, 'name');
		const pedido = Number(form.get('is_active'));
		const is_active = isRecordState(pedido) ? pedido : RECORD_STATE.ACTIVE;

		// `values` viaja en todo `fail`: el dialogo se re-renderiza al recibir
		// la respuesta y sin esto se quedaria vacio.
		const values = { category_id: categoryId, name, is_active: String(form.get('is_active') ?? '') };
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
					is_active
				})
			: await getSubcategoryRepository().create(ctx, {
					category_id: categoryId,
					name,
					is_active
				});

		await recordAuditLog(event, {
			action: id ? 'settings.subcategory.updated' : 'settings.subcategory.created',
			entity_type: 'subcategory',
			entity_id: String(saved.id),
			description: `Subcategoría ${id ? 'actualizada' : 'creada'}: ${saved.name}`
		});

		return { success: `«${saved.name}» ${id ? 'se actualizó' : 'se creó'} correctamente.` };
	},

	toggle: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const ctx = toTenantContext(companyId);

		const id = text(form, 'id');
		const pedido = Number(form.get('is_active'));
		const isActive = isRecordState(pedido) ? pedido : RECORD_STATE.INACTIVE;
		if (!id) return fail(400, { error: 'Falta el identificador.' });

		const subcategories = await getSubcategoryRepository().list(ctx, undefined, {
			state: [RECORD_STATE.ACTIVE, RECORD_STATE.INACTIVE, RECORD_STATE.ARCHIVED]
		});
		const entry = subcategories.find((s) => String(s.id) === id);
		if (!entry) return fail(404, { error: 'Subcategoría no encontrada.' });

		await getSubcategoryRepository().setActive(ctx, id, isActive);

		const activada = isActive === RECORD_STATE.ACTIVE;
		await recordAuditLog(event, {
			action: activada ? 'settings.subcategory.reactivated' : 'settings.subcategory.deactivated',
			entity_type: 'subcategory',
			entity_id: id,
			description: `Subcategoría ${activada ? 'reactivada' : 'desactivada'}: ${entry.name}`
		});

		return { success: `«${entry.name}» ${activada ? 'se reactivó' : 'se desactivó'}.` };
	}
};
