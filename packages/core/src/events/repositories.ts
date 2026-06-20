import type { Event, ESRId } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type CreateEventInput = Omit<Event, 'id'>;
export type TenantCreateEventInput = Omit<CreateEventInput, 'company_id'>;
export type EventListFilters = { search?: string; status?: string; date?: string; limit?: number; offset?: number };

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
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
}

export type EventConflictInput = {
	date: string;
	client_id?: ESRId | '';
	location?: string;
	exclude_event_id?: ESRId;
};
