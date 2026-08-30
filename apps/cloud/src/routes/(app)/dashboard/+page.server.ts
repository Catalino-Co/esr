import { ACTIVE_INVENTORY_ORDER_STATUSES } from '@esr/core';
import type { PageServerLoad } from './$types';
import {
	getDashboardRepository,
	getEventRepository,
	getQuoteRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Ventanas que ofrece el selector de periodo. Sin `export`: SvelteKit solo
 * admite `load`, `actions` y unas pocas mas en un `+page.server.ts`. Viaja a la
 * pantalla dentro de los datos del `load`.
 */
const PERIODOS = [7, 30, 90] as const;
const PERIODO_POR_DEFECTO = 30;

const ACTIVE_ORDER_STATUSES = new Set<string>(ACTIVE_INVENTORY_ORDER_STATUSES);

/** `YYYY-MM-DD` en hora LOCAL. `toISOString()` daria el dia de UTC. */
function fechaLocal(date: Date): string {
	const mes = String(date.getMonth() + 1).padStart(2, '0');
	const dia = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${mes}-${dia}`;
}

function parsePeriodo(value: string | null): number {
	const dias = Number(value);
	return (PERIODOS as readonly number[]).includes(dias) ? dias : PERIODO_POR_DEFECTO;
}

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const parentData = await parent();
	const { companyId } = requirePermission(locals, 'customers.view');
	const ctx = toTenantContext(companyId);

	const dias = parsePeriodo(url.searchParams.get('dias'));
	const hoy = new Date();
	const desde = new Date(hoy);
	desde.setDate(desde.getDate() - (dias - 1));
	const range = { from: fechaLocal(desde), to: fechaLocal(hoy) };

	const [stats, events, quotes, orders] = await Promise.all([
		// Seis COUNT en una sola consulta, no seis listados medidos con .length.
		getDashboardRepository().stats(ctx, range),
		getEventRepository().list(ctx, { limit: 200, offset: 0 }),
		getQuoteRepository().list(ctx, { limit: 20, offset: 0 }),
		getRentalRepository().list(ctx, { limit: 20, offset: 0 })
	]);

	// Los tres paneles son «los proximos/ultimos N», no cifras: una pagina corta
	// basta y no hace falta acotarlos al periodo.
	const today = fechaLocal(hoy);
	const upcomingEvents = events
		.filter((event) => event.date && String(event.date) >= today)
		.sort((a, b) => String(a.date).localeCompare(String(b.date)))
		.slice(0, 5);

	const recentQuotes = quotes.slice(0, 5);
	const activeOrders = orders
		.filter((order) => order.status && ACTIVE_ORDER_STATUSES.has(String(order.status)))
		.slice(0, 5);

	return {
		...parentData,
		stats,
		dias,
		periodos: PERIODOS,
		/** Sello de la consulta: la pantalla lo convierte en «hace N minutos». */
		generadoEn: hoy.toISOString(),
		upcomingEvents,
		recentQuotes,
		activeOrders
	};
};
