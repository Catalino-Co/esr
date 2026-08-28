import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getConduceRepository, getRentalRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'conduces.view');
	const ctx = toTenantContext(companyId);

	const conduce = await getConduceRepository().findById(ctx, params.id);
	if (!conduce) error(404, 'Conduce no encontrado');

	const [items, order] = await Promise.all([
		getConduceRepository().listItems(ctx, params.id),
		getRentalRepository().findById(ctx, conduce.work_order_id)
	]);

	return { conduce, items, order };
};
