import type { Event, ESRId } from '@esr/schemas';

export type CreateEventInput = Omit<Event, 'id'>;

export interface EventRepository {
	findById(id: ESRId): Promise<Event | null>;
	findConflictingByDate(input: EventConflictInput): Promise<Event[]>;
	create(data: CreateEventInput): Promise<Event>;
	update(id: ESRId, data: Partial<Event>): Promise<Event>;
}

export type EventConflictInput = {
	date: string;
	client_id?: ESRId | '';
	location?: string;
	exclude_event_id?: ESRId;
};
