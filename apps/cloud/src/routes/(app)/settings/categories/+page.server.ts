import { fail } from '@sveltejs/kit';
import { RECORD_STATE, SELECTABLE_STATES, isRecordState, parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { text } from '$lib/server/catalogs';
import { requirePermission } from '$lib/server/permissions';
import { getCategoryRepository, getSubcategoryRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Categorias no usa el helper generico de catalogos porque su formulario y su
 * unicidad son propios. Las subcategorias viven en /settings/subcategories:
 * son otra entidad, con su padre y su propia tabla.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const ctx = toTenantContext(companyId);
	const state = parseRecordState(url.searchParams.get('state'));
	const search = url.searchParams.get('search') ?? '';

	const categories = await getCategoryRepository().list(ctx, { state });

	// El repositorio no filtra por texto y la lista es corta: se filtra aqui,
	// igual que /packages.
	const termino = search.trim().toLowerCase();
	const filtradas = termino
		? categories.filter((c) => (c.name ?? '').toLowerCase().includes(termino))
		: categories;

	// Para el desplegable de subcategorias hace falta saber cuantas cuelgan.
	const subcategories = await getSubcategoryRepository().list(ctx, undefined, {
		state: SELECTABLE_STATES
	});

	return { categories: filtradas, subcategories, state, search };
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
		const values = { name, color, is_active: String(form.get('is_active') ?? '') };
		if (!name) return fail(400, { error: 'El nombre de la categoría es obligatorio.', values });

		const duplicate = await getCategoryRepository().findByName(ctx, name);
		if (duplicate && String(duplicate.id) !== id) {
			return fail(400, { error: `Ya existe la categoría «${name}» en esta empresa.`, values });
		}

		// El estado sale del formulario: es el unico sitio donde se archiva una
		// categoria, porque no tiene pantalla de detalle.
		const pedido = Number(form.get('is_active'));
		const is_active = isRecordState(pedido) ? pedido : RECORD_STATE.ACTIVE;

		const saved = id
			? await getCategoryRepository().update(ctx, id, { name, color, is_active })
			: await getCategoryRepository().create(ctx, { name, color, is_active });

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
	}
};
