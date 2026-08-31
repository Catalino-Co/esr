import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getConduceRepository,
	getInvoiceRepository,
	getRentalRepository,
	getWorkOrderOperationsService
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

const CANCELLED = 'anulado';

/** Los dos modos de anulacion. Ver `cancelConduce` en el servicio. */
const MODES = ['documento', 'operacion'] as const;

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

	return {
		conduce,
		items,
		order,
		invoice,
		anulable: conduce.status !== CANCELLED
	};
};

export const actions: Actions = {
	/**
	 * Anular en modo `operacion` deshace la entrega o la devolucion entera. El
	 * servicio lo hace en una transaccion y rechaza de antemano lo que no puede
	 * revertir; aqui solo se valida la forma y se traduce el fallo.
	 */
	cancel: async (event) => {
		const { companyId } = requirePermission(event.locals, 'conduces.cancel');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const mode = String(form.get('mode') ?? '').trim();
		const reason = String(form.get('reason') ?? '').trim();
		if (!MODES.includes(mode as (typeof MODES)[number])) {
			return fail(400, { error: 'Elija qué se anula.' });
		}
		if (!reason) return fail(400, { error: 'Indique el motivo de la anulación.' });

		let resultado;
		try {
			resultado = await getWorkOrderOperationsService().cancelConduce(ctx, event.params.id, {
				mode: mode as (typeof MODES)[number],
				reason
			});
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}

		await recordAuditLog(event, {
			action: 'conduce.cancelled',
			entity_type: 'conduce',
			entity_id: String(event.params.id),
			description: `Conduce ${resultado.conduce.note_number} anulado (${mode}): ${reason}`,
			metadata: {
				mode,
				orderStatus: resultado.order?.status ?? null,
				voidedIncidents: resultado.voidedIncidents
			}
		});

		if (mode === 'documento') {
			return { success: 'Conduce anulado. La operación no se tocó.' };
		}

		const partes = ['Conduce anulado y operación deshecha.'];
		if (resultado.order) partes.push(`La orden queda en «${resultado.order.status}».`);
		if (resultado.voidedIncidents) {
			partes.push(`Se anularon ${resultado.voidedIncidents} incidencia(s) que generó.`);
		}
		return { success: partes.join(' ') };
	}
};
