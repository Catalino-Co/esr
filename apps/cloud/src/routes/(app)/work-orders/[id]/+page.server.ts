import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getChecklistRepository,
	getConduceRepository,
	getCustomerRepository,
	getEventRepository,
	getIncidentRepository,
	getQuoteRepository,
	getRentalRepository,
	getStockMovementRepository,
	getWorkOrderOperationsService
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, params.id);
	if (!order) error(404, 'Orden no encontrada');

	const [items, customer, event, quote, conduces, incidents, stockMovements, outboundChecklist, returnChecklist] =
		await Promise.all([
			getRentalRepository().listItems(ctx, params.id),
			getCustomerRepository().findById(ctx, order.client_id),
			order.event_id ? getEventRepository().findById(ctx, order.event_id) : Promise.resolve(null),
			order.quotation_id ? getQuoteRepository().findById(ctx, order.quotation_id) : Promise.resolve(null),
			getConduceRepository().findByWorkOrderId(ctx, params.id),
			getIncidentRepository().findByWorkOrderId(ctx, params.id),
			getStockMovementRepository().listByWorkOrder(ctx, params.id),
			getChecklistRepository().findByWorkOrder(ctx, params.id, 'salida'),
			getChecklistRepository().findByWorkOrder(ctx, params.id, 'retorno')
		]);

	const conducesWithItems = await Promise.all(
		conduces.map(async (conduce) => ({
			conduce,
			items: conduce.id ? await getConduceRepository().listItems(ctx, conduce.id) : []
		}))
	);

	return {
		order,
		items,
		customer,
		event,
		quote,
		conduces: conducesWithItems,
		incidents,
		stockMovements,
		checklists: { outbound: outboundChecklist, return: returnChecklist }
	};
};

export const actions: Actions = {
	prepare: async ({ locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		try {
			await getWorkOrderOperationsService().prepareOrder(ctx, params.id);
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo preparar la orden.';
			return fail(400, { error: message });
		}
	},
	cancel: async ({ locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		try {
			await getRentalRepository().cancelOrder(ctx, params.id);
			throw redirect(303, '/work-orders');
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo cancelar la orden.';
			return fail(400, { error: message });
		}
	},
	close: async ({ locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		try {
			await getWorkOrderOperationsService().closeOrder(ctx, params.id);
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo cerrar la orden.';
			return fail(400, { error: message });
		}
	}
};
