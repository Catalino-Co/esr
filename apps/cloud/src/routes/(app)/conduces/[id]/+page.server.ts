import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getConduceRepository,
	getInvoiceRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * El conduce es la NOTA DE ENTREGA, no el documento de dinero.
 *
 * Tuvo el estado de cuenta durante una fase; se lo llevo la factura, que es la
 * que cubre una o varias entregas y de la que cuelgan los cobros. Aqui queda el
 * enlace a esa factura para no perder el hilo.
 *
 * El modulo ya no esta en el menu: se llega desde la orden y desde la factura,
 * a la espera de que se retome.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'conduces.view');
	const ctx = toTenantContext(companyId);

	const conduce = await getConduceRepository().findById(ctx, params.id);
	if (!conduce) error(404, 'Conduce no encontrado');

	const [items, order, invoice] = await Promise.all([
		getConduceRepository().listItems(ctx, params.id),
		getRentalRepository().findById(ctx, conduce.work_order_id),
		getInvoiceRepository().findByConduce(ctx, params.id)
	]);

	return { conduce, items, order, invoice };
};
