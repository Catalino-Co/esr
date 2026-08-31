import type { ESRId, RentalOrder, RentalOrderItem } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

export type CreateRentalOrderInput = Omit<RentalOrder, 'id'> & { items: RentalOrderItem[] };
export type TenantCreateRentalOrderInput = Omit<CreateRentalOrderInput, 'company_id'>;
export type RentalOrderListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter; search?: string; status?: string; date?: string; event_id?: ESRId; limit?: number; offset?: number };

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
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
	listItems(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrderItem[]>;
	replaceItems(ctx: RepositoryContext, orderId: ESRId, items: RentalOrderItem[]): Promise<void>;
}
