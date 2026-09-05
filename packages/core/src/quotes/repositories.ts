import type { ESRId, Quote, QuoteItem } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

export type CreateQuoteInput = Omit<Quote, 'id'> & { items: QuoteItem[] };
export type TenantCreateQuoteInput = Omit<CreateQuoteInput, 'company_id'>;
export type QuoteListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter;
	search?: string;
	status?: string;
	event_id?: ESRId;
	/**
	 * Solo las HUERFANAS: `event_id IS NULL`.
	 *
	 * Campo aparte y no `event_id: null`, que seria lo natural: `event_id` se
	 * aplica con `if (filters.event_id)`, una prueba de veracidad, asi que un
	 * nulo no filtraria NADA y la peticion «solo huerfanas» devolveria todas.
	 * Para un selector de documentos a vincular ese es el peor fallo posible.
	 */
	without_event?: boolean;
	/**
	 * Ventana de fechas sobre `date`. Ambos extremos inclusive, `YYYY-MM-DD`, y
	 * cada uno opcional: dejar uno vacio deja ese lado abierto. Gemelo del de
	 * `RentalOrderListFilters`.
	 */
	date_from?: string;
	date_to?: string;
	limit?: number;
	offset?: number;
};

export type AddQuoteItemInput = {
	item_id: ESRId;
	quantity: number;
	price: number;
	/**
	 * Descuento e impuesto de la linea, en PORCENTAJE. Opcionales: una linea
	 * sin tasas es una linea sin descuento y sin impuesto, que es el caso mas
	 * comun en un alquiler exento.
	 */
	discount_rate?: number;
	tax_rate?: number;
	start_date?: string;
	end_date?: string;
};

export type QuoteTotalsInput = {
	subtotal: number;
	discount: number;
	tax_amount: number;
	total: number;
};

export interface QuoteRepository {
	findById(id: ESRId): Promise<Quote | null>;
	create(data: CreateQuoteInput): Promise<Quote>;
	update(id: ESRId, data: Partial<Quote>): Promise<Quote>;
	replaceItems(quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}

export interface TenantQuoteRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Quote | null>;
	list(ctx: RepositoryContext, filters?: QuoteListFilters): Promise<Quote[]>;
	findByEventId(ctx: RepositoryContext, eventId: ESRId): Promise<Quote[]>;
	create(ctx: RepositoryContext, data: TenantCreateQuoteInput): Promise<Quote>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateQuoteInput>): Promise<Quote>;
	/**
	 * Engancha la cotizacion al evento, si sigue huerfana y viva.
	 *
	 * EL VINCULO VIVE EN EL DOCUMENTO, NO EN EL EVENTO. Hay dos posibles en la
	 * base —`events.quotation_id` y `quotations.event_id`— y manda el segundo:
	 * es el que el dialogo de alta de cotizaciones rellena SIEMPRE, el que ya
	 * lee `findByEventId`, y por tanto el unico que no puede discrepar de la
	 * realidad. `events.quotation_id` y `events.work_order_id` quedan muertas.
	 *
	 * Solo ENGANCHA, nunca suelta: un evento puede tener varias cotizaciones, y
	 * desenganchar «las que no se eligieron» seria borrar vinculos que nadie
	 * pidio tocar. Para soltar una se abre esa cotizacion y se le cambia el
	 * evento.
	 *
	 * NO se hace con `update()`, y no es un capricho: aquel relee la fila y
	 * reescribe las doce columnas, asi que ademas de no poder expresar la
	 * condicion, revertiria en silencio cualquier cambio que otra peticion
	 * hiciera entremedias. Aqui las tres guardas —empresa, orfandad y
	 * circulacion— se evaluan en la MISMA sentencia que escribe.
	 *
	 * `false` significa «no se escribio nada». Quien llama decide que contar:
	 * si ya era de este evento es un exito idempotente, y si es de otro, un
	 * conflicto que hay que decir en voz alta.
	 */
	linkToEvent(ctx: RepositoryContext, quoteId: ESRId, eventId: ESRId): Promise<boolean>;
	/**
	 * Cotizaciones cuyo NUMERO contiene `termino`. Para el buscador por numero.
	 *
	 * Sin filtro de estado ni de circulacion, a proposito: si se busca por
	 * numero es porque se sabe cual es, y una cancelada o archivada tiene que
	 * aparecer igual. Gemelo del de `TenantRentalOrderRepository`.
	 */
	searchByNumber(ctx: RepositoryContext, termino: string, limite?: number): Promise<Quote[]>;
	/**
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
	listItems(ctx: RepositoryContext, quoteId: ESRId): Promise<QuoteItem[]>;
	addItem(ctx: RepositoryContext, quoteId: ESRId, data: AddQuoteItemInput): Promise<QuoteItem>;
	updateItem(ctx: RepositoryContext, quoteId: ESRId, itemId: ESRId, data: Partial<AddQuoteItemInput>): Promise<QuoteItem>;
	removeItem(ctx: RepositoryContext, quoteId: ESRId, itemId: ESRId): Promise<void>;
	updateTotals(ctx: RepositoryContext, quoteId: ESRId, totals: QuoteTotalsInput): Promise<Quote>;
	changeStatus(ctx: RepositoryContext, quoteId: ESRId, status: Quote['status']): Promise<Quote>;
	replaceItems(ctx: RepositoryContext, quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}
