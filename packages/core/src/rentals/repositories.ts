import type { ESRId, RentalOrder, RentalOrderItem } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

export type CreateRentalOrderInput = Omit<RentalOrder, 'id'> & { items: RentalOrderItem[] };
export type TenantCreateRentalOrderInput = Omit<CreateRentalOrderInput, 'company_id'>;
export type RentalOrderListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter;
	search?: string;
	status?: string;
	/**
	 * Ventana de fechas sobre `date`, la de OPERACION. Ambos extremos
	 * inclusive, `YYYY-MM-DD`, y cada uno opcional: dejar uno vacio deja ese
	 * lado abierto, que es como se piden mas de un año sin inventar centinelas.
	 */
	date_from?: string;
	date_to?: string;
	event_id?: ESRId;
	/** Solo las HUERFANAS. Ver la nota gemela en `QuoteListFilters`. */
	without_event?: boolean;
	limit?: number;
	offset?: number;
};

export interface RentalOrderRepository {
	findById(id: ESRId): Promise<RentalOrder | null>;
	create(data: CreateRentalOrderInput): Promise<RentalOrder>;
	update(id: ESRId, data: Partial<RentalOrder>): Promise<RentalOrder>;
	listItems(orderId: ESRId): Promise<RentalOrderItem[]>;
	replaceItems(orderId: ESRId, items: RentalOrderItem[]): Promise<void>;
}

export interface TenantRentalOrderRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<RentalOrder | null>;
	list(ctx: RepositoryContext, filters?: RentalOrderListFilters): Promise<RentalOrder[]>;
	/**
	 * Las ordenes de un evento.
	 *
	 * Gemelo del `findByEventId` que el repositorio de cotizaciones ya tenia.
	 * Faltaba aqui, y sin el la ficha del evento no puede enseñar su orden.
	 */
	findByEventId(ctx: RepositoryContext, eventId: ESRId): Promise<RentalOrder[]>;
	create(ctx: RepositoryContext, data: TenantCreateRentalOrderInput): Promise<RentalOrder>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateRentalOrderInput>): Promise<RentalOrder>;
	/**
	 * Engancha la orden al evento, si sigue huerfana y viva.
	 *
	 * Gemelo del de cotizaciones, y con sus mismas razones: el vinculo vive en
	 * `work_orders.event_id`, solo engancha, y las tres guardas van dentro de la
	 * sentencia que escribe en vez de en un `findById` previo. Ver el docblock
	 * de `TenantQuoteRepository.linkToEvent`.
	 */
	linkToEvent(ctx: RepositoryContext, orderId: ESRId, eventId: ESRId): Promise<boolean>;
	/**
	 * Ordenes cuyo NUMERO contiene `termino`. Para el buscador por numero.
	 *
	 * Sin filtro de estado ni de circulacion, a proposito: si se busca por
	 * numero es porque se sabe cual es, y una orden cancelada o archivada tiene
	 * que aparecer igual. Es lo contrario que `list()`, que ofrece lo vivo.
	 */
	searchByNumber(ctx: RepositoryContext, termino: string, limite?: number): Promise<RentalOrder[]>;
	/**
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
	listItems(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrderItem[]>;
	replaceItems(ctx: RepositoryContext, orderId: ESRId, items: RentalOrderItem[]): Promise<void>;
}
