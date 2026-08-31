import { error, fail } from '@sveltejs/kit';
import { SELECTABLE_STATES, mergePackageItem } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getInventoryRepository, getPackageRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'packages.view');
	const ctx = toTenantContext(companyId);

	const pkg = await getPackageRepository().findById(ctx, params.id);
	if (!pkg) error(404, 'Paquete no encontrado');

	const [items, inventory] = await Promise.all([
		getPackageRepository().listItems(ctx, params.id),
		getInventoryRepository().list(ctx, { state: SELECTABLE_STATES, limit: 300, offset: 0 })
	]);

	return { pkg, items, inventory };
};

export const actions: Actions = {
	update: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'El nombre del paquete es obligatorio.' });

		const duplicate = await getPackageRepository().findByName(ctx, name);
		if (duplicate && String(duplicate.id) !== String(event.params.id)) {
			return fail(400, { error: `Ya existe el paquete «${name}» en esta empresa.` });
		}

		const updated = await getPackageRepository().update(ctx, event.params.id, {
			name,
			description: String(form.get('description') ?? '').trim() || undefined,
			suggested_price: Number(form.get('suggested_price') ?? 0) || 0,
			notes: String(form.get('notes') ?? '').trim() || undefined
		});

		await recordAuditLog(event, {
			action: 'package.updated',
			entity_type: 'package',
			entity_id: String(updated.id),
			description: `Paquete actualizado: ${updated.name}`
		});

		return { success: 'Paquete actualizado.' };
	},

	addItem: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const itemId = String(form.get('item_id') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 1);
		if (!itemId) return fail(400, { error: 'Seleccione un artículo.' });
		if (!Number.isFinite(quantity) || quantity < 1) {
			return fail(400, { error: 'La cantidad debe ser al menos 1.' });
		}

		const current = await getPackageRepository().listItems(ctx, event.params.id);
		// Si el artículo ya está en el paquete se suma la cantidad en vez de
		// duplicar la línea: el índice único de la migración 009 lo exige.
		const next = mergePackageItem(current, { item_id: itemId, quantity });
		await getPackageRepository().replaceItems(ctx, event.params.id, next);

		await recordAuditLog(event, {
			action: 'package.item_added',
			entity_type: 'package',
			entity_id: event.params.id,
			description: `Artículo agregado al paquete #${event.params.id}`,
			metadata: { itemId, quantity }
		});

		return { success: 'Artículo agregado al paquete.' };
	},

	updateItem: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const itemId = String(form.get('item_id') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 0);
		if (!Number.isFinite(quantity) || quantity < 1) {
			return fail(400, { error: 'La cantidad debe ser al menos 1.' });
		}

		const current = await getPackageRepository().listItems(ctx, event.params.id);
		const next = current.map((line) =>
			String(line.item_id) === itemId ? { ...line, quantity } : line
		);
		await getPackageRepository().replaceItems(ctx, event.params.id, next);

		return { success: 'Cantidad actualizada.' };
	},

	removeItem: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const itemId = String(form.get('item_id') ?? '').trim();
		const current = await getPackageRepository().listItems(ctx, event.params.id);
		const next = current.filter((line) => String(line.item_id) !== itemId);
		await getPackageRepository().replaceItems(ctx, event.params.id, next);

		await recordAuditLog(event, {
			action: 'package.item_removed',
			entity_type: 'package',
			entity_id: event.params.id,
			description: `Artículo quitado del paquete #${event.params.id}`,
			metadata: { itemId }
		});

		return { success: 'Artículo quitado del paquete.' };
	}
};
