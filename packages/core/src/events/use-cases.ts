import { validateEventInput, type Event } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export type CreateEventInput = Omit<Event, 'id'>;

export function createEventDraft(input: CreateEventInput): UseCaseResult<CreateEventInput> {
	const validation = validateEventInput(input);
	if (!validation.valid) return fail(validation.issues[0] || 'event.invalid');

	return ok({
		...input,
		status: input.status || 'confirmado'
	});
}

export function hasDateRangeConflict(
	input: { startDate?: string | null; endDate?: string | null },
	existing: Array<{ startDate?: string | null; endDate?: string | null }>
): boolean {
	if (!input.startDate) return false;
	const inputStart = input.startDate;
	const inputEnd = input.endDate || input.startDate;

	return existing.some((event) => {
		if (!event.startDate) return false;
		const eventStart = event.startDate;
		const eventEnd = event.endDate || event.startDate;
		return inputStart <= eventEnd && inputEnd >= eventStart;
	});
}
