import type { RepositoryContext } from '@esr/core';
import type { ESRId, Quote } from '@esr/schemas';
import { withTransaction } from '../transaction';
import { PostgresCustomerRepository } from '../repositories/postgres-customer.repository';
import { PostgresEventRepository } from '../repositories/postgres-event.repository';
import { PostgresQuoteRepository } from '../repositories/postgres-quote.repository';

/**
 * Copiar una cotizacion, al mismo cliente o a otro.
 *
 * Lo que se hereda son las CONDICIONES COMERCIALES —lineas, descuento,
 * impuesto, notas, condiciones y validez—; lo que describe el ciclo de vida del
 * documento original no se hereda nunca: la copia nace en `borrador`, activa, y
 * sin las marcas de confirmacion ni de cancelacion. Copiar una cotizacion ya
 * convertida no debe producir otra que se crea convertida.
 *
 * El destino puede ser otro cliente. En ese caso el evento del original no
 * sirve —es de otro—, asi que se pide explicitamente y se comprueba que
 * pertenezca al cliente elegido.
 */
export type CopyQuoteInput = {
	/** Cliente destino. Puede ser el mismo del original. */
	client_id: ESRId;
	/** Evento destino. Opcional; si viene, tiene que ser de ese cliente. */
	event_id?: ESRId | '' | null;
};

export class QuoteCopyService {
	constructor(
		private readonly quotes = new PostgresQuoteRepository(),
		private readonly customers = new PostgresCustomerRepository(),
		private readonly events = new PostgresEventRepository()
	) {}

	async copy(ctx: RepositoryContext, quoteId: ESRId, input: CopyQuoteInput): Promise<Quote> {
		if (!input.client_id) throw new Error('Elija el cliente de destino.');

		// Ningun id del formulario se cree por venir de un `<select>`: el POST se
		// manipula, y las claves foraneas apuntan a la tabla entera, no a la
		// empresa.
		const cliente = await this.customers.findById(ctx, input.client_id);
		if (!cliente) throw new Error('El cliente no pertenece a su empresa.');

		if (input.event_id) {
			const evento = await this.events.findById(ctx, input.event_id as ESRId);
			if (!evento) throw new Error('El evento no pertenece a su empresa.');
			// Un evento de otro cliente en una cotizacion es una incoherencia que
			// nadie detectaria despues.
			if (String(evento.client_id) !== String(input.client_id)) {
				throw new Error('Ese evento es de otro cliente.');
			}
		}

		return withTransaction(async (client) => {
			const original = await this.quotes.findById(ctx, quoteId, client);
			if (!original) throw new Error('La cotización no existe en esta empresa.');

			const lineas = await this.quotes.listItems(ctx, quoteId, client);
			if (!lineas.length) throw new Error('Esa cotización no tiene líneas que copiar.');

			return this.quotes.create(
				ctx,
				{
					client_id: input.client_id,
					event_id: input.event_id || null,
					// `date` y `valid_until` van SIN valor a proposito, no a null:
					// el repositorio pone hoy en la fecha, y arrastrar el
					// `valid_until` del original heredaria una validez ya vencida.
					// La copia es un documento nuevo y su plazo cuenta desde que se
					// emite.
					validity_days: original.validity_days ?? 15,
					// `discount` y `tax_amount` NO se copian de la cabecera: dejaron
					// de ser dato de entrada. `create` los recalcula desde las tasas
					// de las lineas, que si se copian.
					notes: original.notes,
					conditions: original.conditions,
					// El ciclo de vida NO se hereda.
					status: 'borrador',
					is_active: 1,
					// Las lineas van sin `id` ni `quotation_id`: son filas nuevas.
					// `replaceItems` las escribe con sus fechas, su descuento y su
					// paquete, cosa que hasta la fase 5 no hacia.
					items: lineas.map((linea) => ({
						item_id: linea.item_id ?? null,
						package_id: linea.package_id ?? null,
						name: linea.name,
						code: linea.code,
						quantity: linea.quantity,
						price: linea.price,
						total: linea.total,
						// Copiar una cotizacion tiene que copiar tambien lo que se
						// negocio en cada linea; sin estas dos, la copia sale sin
						// impuesto y con otro total que el original.
						discount_rate: linea.discount_rate ?? 0,
						tax_rate: linea.tax_rate ?? 0,
						discount_amount: linea.discount_amount ?? 0,
						start_date: linea.start_date ?? null,
						end_date: linea.end_date ?? null
					}))
				},
				client
			);
		});
	}
}
