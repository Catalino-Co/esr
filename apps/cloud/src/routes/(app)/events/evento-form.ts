import type { RepositoryContext } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import { getQuoteRepository, getRentalRepository } from '$lib/server/repositories';

/**
 * Los campos del evento, leidos de un formulario.
 *
 * Uno solo para el alta y para la edicion: son el MISMO formulario, y tenerlo
 * dos veces es como se separaron las dos pantallas de cotizaciones.
 *
 * Los trece campos de ESR Pro. Cloud solo sacaba siete a pantalla, aunque las
 * columnas existen en las dos bases desde el esquema inicial.
 */
export type ValoresEvento = ReturnType<typeof leerEvento>;

export function leerEvento(form: FormData) {
	const texto = (clave: string) => String(form.get(clave) ?? '').trim();
	return {
		name: texto('name'),
		client_id: texto('client_id'),
		event_type: texto('event_type'),
		date: texto('date'),
		departure_time: texto('departure_time'),
		setup_time: texto('setup_time'),
		pickup_date: texto('pickup_date'),
		pickup_time: texto('pickup_time'),
		location: texto('location'),
		responsible_person: texto('responsible_person'),
		notes: texto('notes'),
		status: texto('status') || 'tentativo',
		quotation_id: texto('quotation_id'),
		work_order_id: texto('work_order_id')
	};
}

/**
 * Engancha al evento la cotizacion y la orden elegidas.
 *
 * ESCRIBE EN EL DOCUMENTO, NO EN EL EVENTO. Hay dos vinculos posibles en la
 * base —`events.quotation_id` y `quotations.event_id`— y manda el segundo: es
 * el que el dialogo de alta de cotizaciones rellena SIEMPRE, el que ya lee
 * `findByEventId`, y por tanto el unico que no puede discrepar de la realidad.
 * `events.quotation_id` y `events.work_order_id` quedan muertas.
 *
 * Solo ENGANCHA, nunca suelta. El desplegable ofrece unicamente documentos
 * huerfanos, asi que no hay forma de robarselos a otro evento; y como un evento
 * puede tener varias cotizaciones, desenganchar «las que no se eligieron» seria
 * borrar vinculos que nadie pidio tocar. Para soltar una, se abre esa
 * cotizacion y se le cambia el evento.
 *
 * Se comprueba que el documento sea de la empresa y que siga huerfano antes de
 * escribir: entre que se pinto el desplegable y se envio el formulario alguien
 * pudo asignarlo desde otra pestaña.
 */
export async function vincularDocumentos(
	ctx: RepositoryContext,
	eventId: ESRId,
	values: Pick<ValoresEvento, 'quotation_id' | 'work_order_id'>
): Promise<void> {
	if (values.quotation_id) {
		const quote = await getQuoteRepository().findById(ctx, values.quotation_id);
		if (quote && !quote.event_id) {
			await getQuoteRepository().update(ctx, values.quotation_id, { event_id: eventId });
		}
	}

	if (values.work_order_id) {
		const order = await getRentalRepository().findById(ctx, values.work_order_id);
		if (order && !order.event_id) {
			await getRentalRepository().update(ctx, values.work_order_id, { event_id: eventId });
		}
	}
}
