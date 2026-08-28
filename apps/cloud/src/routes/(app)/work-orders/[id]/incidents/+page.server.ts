import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateCreateIncidentInput } from '@esr/schemas';
import { getIncidentRepository, getRentalRepository, getWorkOrderOperationsService } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'incidents.view');
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, params.id);
	if (!order) error(404, 'Orden no encontrada');

	const [incidents, items] = await Promise.all([
		getIncidentRepository().findByWorkOrderId(ctx, params.id),
		getRentalRepository().listItems(ctx, params.id)
	]);

	return { order, incidents, items };
};

export const actions: Actions = {
	create: async ({ request, locals, params, getClientAddress }) => {
		const { companyId, user } = requirePermission(locals, 'incidents.create');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const payload = {
			work_order_id: params.id,
			type: String(form.get('type') ?? ''),
			description: String(form.get('description') ?? '').trim(),
			severity: String(form.get('severity') ?? 'media'),
			item_id: String(form.get('item_id') ?? '').trim() || undefined,
			estimated_cost: form.get('estimated_cost') != null && form.get('estimated_cost') !== ''
				? Number(form.get('estimated_cost'))
				: 0
		};

		const validation = validateCreateIncidentInput(payload);
		if (!validation.valid) return fail(400, { error: 'Datos de incidencia inválidos.' });

		const order = await getRentalRepository().findById(ctx, params.id);
		if (!order) error(404, 'Orden no encontrada');

		try {
			const incident = await getWorkOrderOperationsService().createIncident(ctx, {
				type: payload.type,
				description: payload.description,
				severity: payload.severity,
				item_id: payload.item_id,
				client_id: order.client_id,
				work_order_id: params.id,
				estimated_cost: payload.estimated_cost,
				status: 'reportado',
				notes: user?.name ? `Reportado por ${user.name}` : undefined
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'incident.created',
				entity_type: 'incident',
				entity_id: String(incident.id),
				description: `Incidencia creada en orden #${params.id}`
			});
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo crear la incidencia.';
			return fail(400, { error: message });
		}
	},
	resolve: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'incidents.resolve');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();
		const incidentId = String(form.get('incident_id') ?? '');
		if (!incidentId) return fail(400, { error: 'Incidencia no indicada.' });

		const incident = await getIncidentRepository().findById(ctx, incidentId);
		if (!incident || String(incident.work_order_id) !== String(params.id)) {
			return fail(404, { error: 'Incidencia no encontrada.' });
		}

		try {
			await getWorkOrderOperationsService().resolveIncident(ctx, incidentId);
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'incident.resolved',
				entity_type: 'incident',
				entity_id: incidentId,
				description: `Incidencia resuelta #${incidentId}`
			});
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo resolver la incidencia.';
			return fail(400, { error: message });
		}
	}
};
