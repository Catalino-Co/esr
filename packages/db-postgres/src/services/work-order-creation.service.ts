import type { RepositoryContext } from '@esr/core';
import { directOrderErrorMessage, validateDirectOrderDraft } from '@esr/core';
import type { ESRId, RentalOrder } from '@esr/schemas';
import { withTransaction } from '../transaction';
import { PostgresCustomerRepository } from '../repositories/postgres-customer.repository';
import { PostgresEventRepository } from '../repositories/postgres-event.repository';
import { PostgresInventoryRepository } from '../repositories/postgres-inventory.repository';
import { PostgresQuoteRepository } from '../repositories/postgres-quote.repository';
import { PostgresRentalRepository } from '../repositories/postgres-rental.repository';

/**
 * Crear una orden SIN cotizacion detras.
 *
 * El esquema siempre lo permitio —`work_orders.quotation_id` es nullable— pero
 * no habia por donde. Este servicio es el espejo de `QuoteConversionService`:
 * las mismas comprobaciones de disponibilidad y la misma transaccion, saltandose
 * el documento comercial.
 *
 * La disponibilidad se pide al repositorio de cotizaciones porque es donde vive
 * `checkAvailability`. Esta mal colocada —es una regla de inventario— pero
 * duplicarla aqui crearia una tercera copia divergente, que es exactamente el
 * problema que este codigo ya arrastra con las constantes de estado.
 */
export type DirectOrderInput = {
	client_id: ESRId | '';
	event_id?: ESRId | '' | null;
	date?: string | null;
	/** Ventana de alquiler, comun a todas las lineas. Es con la que se reserva. */
	start_date?: string | null;
	end_date?: string | null;
	responsible_person?: string | null;
	vehicle?: string | null;
	notes?: string | null;
	lines: Array<{ item_id: ESRId | ''; quantity: number | string; price: number | string }>;
};

export class WorkOrderCreationService {
	constructor(
		private readonly orders = new PostgresRentalRepository(),
		private readonly quotes = new PostgresQuoteRepository(),
		private readonly inventory = new PostgresInventoryRepository(),
		private readonly customers = new PostgresCustomerRepository(),
		private readonly events = new PostgresEventRepository()
	) {}

	async createDirect(ctx: RepositoryContext, input: DirectOrderInput): Promise<RentalOrder> {
		const check = validateDirectOrderDraft({
			client_id: input.client_id,
			start_date: input.start_date,
			end_date: input.end_date,
			lines: input.lines
		});
		if (!check.ok) throw new Error(directOrderErrorMessage(check.error));

		const lineas = input.lines.filter((linea) => linea.item_id);

		// ── Todo lo que llega por el formulario tiene que ser de ESTA empresa ──
		//
		// Ningun id del formulario se cree por venir de un `<select>`: el POST se
		// manipula. Las claves foraneas no lo frenan porque apuntan a la tabla
		// entera, no a la empresa, asi que una orden podia acabar apuntando al
		// cliente de otro inquilino.
		const cliente = await this.customers.findById(ctx, input.client_id as ESRId);
		if (!cliente) throw new Error('El cliente no pertenece a su empresa.');

		if (input.event_id) {
			const evento = await this.events.findById(ctx, input.event_id as ESRId);
			if (!evento) throw new Error('El evento no pertenece a su empresa.');
		}

		const articulos = new Map<string, string>();
		for (const linea of lineas) {
			const item = await this.inventory.findById(ctx, linea.item_id as ESRId);
			if (!item) throw new Error('Uno de los artículos no pertenece a su empresa.');
			articulos.set(String(linea.item_id), item.name ?? `#${linea.item_id}`);
		}

		return withTransaction(async (client) => {
			// La orden aparta stock desde que nace, asi que hay que comprobar que
			// lo hay ANTES. Es la misma comprobacion que hace la conversion de una
			// cotizacion; sin ella se podria comprometer dos veces el mismo
			// articulo.
			for (const linea of lineas) {
				const cantidad = Number(linea.quantity);
				const disponible = await this.quotes.checkAvailability(
					ctx,
					linea.item_id as ESRId,
					cantidad,
					input.start_date || undefined,
					input.end_date || undefined
				);
				if (!disponible.ok) {
					throw new Error(
						`No hay disponibilidad de ${articulos.get(String(linea.item_id))}: se piden ${cantidad} y quedan ${disponible.available}.`
					);
				}
			}

			return this.orders.create(
				ctx,
				{
					client_id: input.client_id as ESRId,
					event_id: (input.event_id || null) as ESRId | null,
					date: input.date || null,
					responsible_person: input.responsible_person || null,
					vehicle: input.vehicle || null,
					notes: input.notes || null,
					items: lineas.map((linea) => ({
						item_id: linea.item_id as ESRId,
						quantity: Number(linea.quantity),
						price: Number(linea.price),
						start_date: input.start_date || null,
						end_date: input.end_date || null
					}))
				} as Parameters<PostgresRentalRepository['create']>[1],
				client
			);
		});
	}
}
