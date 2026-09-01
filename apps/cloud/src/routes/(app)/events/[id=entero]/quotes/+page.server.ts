import { error } from '@sveltejs/kit';
import { RECORD_STATES, SELECTABLE_STATES } from '@esr/core';
import type { PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Historial de cotizaciones del evento.
 *
 * Lo que la ficha esconde: las canceladas y las que estan fuera de circulacion.
 * Por eso NO usa `findByEventId` —cuyo contrato es «lo vivo», y del que dependen
 * la tarjeta y el PDF— sino un `list` con los tres estados y sin filtro alguno.
 * No esconder nada es el proposito de esta pantalla.
 *
 * Permiso `quotes.view`, no `events.view`: lo que lista son cotizaciones. Hoy
 * ningun rol tiene una sin la otra, pero la puerta queda donde corresponde.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'quotes.view');
	const ctx = toTenantContext(companyId);

	const event = await getEventRepository().findById(ctx, params.id);
	if (!event) error(404, 'Evento no encontrado');

	const [quotes, customers] = await Promise.all([
		getQuoteRepository().list(ctx, {
			event_id: params.id,
			state: RECORD_STATES,
			limit: 200,
			offset: 0
		}),
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 500, offset: 0 })
	]);

	const nombres = new Map(customers.map((c) => [String(c.id), c.name]));

	return {
		event,
		quotes: quotes.map((quote) => ({
			...quote,
			client_name: nombres.get(String(quote.client_id ?? '')) ?? '—'
		}))
	};
};
