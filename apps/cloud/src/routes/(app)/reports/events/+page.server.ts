import type { PageServerLoad } from './$types';
import { periodoDeRango, SELECTABLE_STATES } from '@esr/core';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getEventTypeRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = event.url.searchParams.get('search')?.trim() || undefined;
	const status = event.url.searchParams.get('status')?.trim() || undefined;
	const dateFrom = event.url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = event.url.searchParams.get('dateTo')?.trim() || undefined;

	// Dos consultas, no una: la Tabla respeta el rango de fechas; el Calendario
	// NO -pagina de mes en mes en memoria y perderia un mes entero si solo
	// viera lo que la Tabla tiene cargado-. Mismo patron que /events.
	const [eventsTabla, eventsCalendario, customers, eventTypes, companyInfo] = await Promise.all([
		getEventRepository().list(ctx, {
			search,
			status,
			date_from: dateFrom,
			date_to: dateTo,
			limit: 500,
			offset: 0
		}),
		getEventRepository().list(ctx, { search, status, limit: 500, offset: 0 }),
		getCustomerRepository().list(ctx, { limit: 500, offset: 0 }),
		getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES }),
		getCompanyDocumentInfo(ctx)
	]);

	const customerMap = new Map(customers.map((c) => [String(c.id), c.name]));
	const conNombre = (ev: (typeof eventsTabla)[number]) => ({
		...ev,
		client_name: ev.client_id ? (customerMap.get(String(ev.client_id)) ?? '—') : '—'
	});

	await recordAuditLog(event, {
		action: 'report.viewed',
		entity_type: 'report',
		entity_id: 'events',
		description: 'Consulta reporte de eventos'
	});

	return {
		events: eventsTabla.map(conNombre),
		eventsCalendario: eventsCalendario.map(conNombre),
		eventTypes,
		search: search ?? '',
		status: status ?? '',
		dateFrom: dateFrom ?? '',
		dateTo: dateTo ?? '',
		rangoActivo: periodoDeRango(dateFrom, dateTo),
		companyInfo
	};
};
