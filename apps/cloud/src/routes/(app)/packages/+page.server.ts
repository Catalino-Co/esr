import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getPackageRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'packages.view');
	// includeInactive: hay que poder ver y reactivar los desactivados.
	const packages = await getPackageRepository().list(toTenantContext(companyId), {
		includeInactive: true
	});
	return { packages };
};

export const actions: Actions = {
	create: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'El nombre del paquete es obligatorio.' });

		const duplicate = await getPackageRepository().findByName(ctx, name);
		if (duplicate) return fail(400, { error: `Ya existe el paquete «${name}» en esta empresa.` });

		const created = await getPackageRepository().create(ctx, {
			name,
			description: String(form.get('description') ?? '').trim() || undefined,
			suggested_price: Number(form.get('suggested_price') ?? 0) || 0,
			is_active: 1
		});

		await recordAuditLog(event, {
			action: 'package.created',
			entity_type: 'package',
			entity_id: String(created.id),
			description: `Paquete creado: ${created.name}`
		});

		throw redirect(303, `/packages/${created.id}`);
	},

	toggle: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.deactivate');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const id = String(form.get('id') ?? '').trim();
		const isActive = String(form.get('is_active') ?? '') === '1' ? 1 : 0;
		if (!id) return fail(400, { error: 'Falta el identificador.' });

		const pkg = await getPackageRepository().findById(ctx, id);
		if (!pkg) return fail(404, { error: 'Paquete no encontrado.' });

		await getPackageRepository().setActive(ctx, id, isActive);

		await recordAuditLog(event, {
			action: isActive ? 'package.reactivated' : 'package.deactivated',
			entity_type: 'package',
			entity_id: id,
			description: `Paquete ${isActive ? 'reactivado' : 'desactivado'}: ${pkg.name}`
		});

		return { success: `«${pkg.name}» ${isActive ? 'se reactivó' : 'se desactivó'}.` };
	}
};
