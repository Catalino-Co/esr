import type { Event, ESRId } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

export type CreateEventInput = Omit<Event, 'id'>;
export type TenantCreateEventInput = Omit<CreateEventInput, 'company_id'>;
export type EventListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter; search?: string; status?: string; date?: string; limit?: number; offset?: number };

export interface EventRepository {
	findById(id: ESRId): Promise<Event | null>;
	findConflictingByDate(input: EventConflictInput): Promise<Event[]>;
	create(data: CreateEventInput): Promise<Event>;
	update(id: ESRId, data: Partial<Event>): Promise<Event>;
}

export interface TenantEventRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Event | null>;
	list(ctx: RepositoryContext, filters?: EventListFilters): Promise<Event[]>;
	findConflictingByDate(ctx: RepositoryContext, input: EventConflictInput): Promise<Event[]>;
	create(ctx: RepositoryContext, data: TenantCreateEventInput): Promise<Event>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateEventInput>): Promise<Event>;
	/**
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
}

export type EventConflictInput = {
	date: string;
	client_id?: ESRId | '';
	location?: string;
	exclude_event_id?: ESRId;
};
