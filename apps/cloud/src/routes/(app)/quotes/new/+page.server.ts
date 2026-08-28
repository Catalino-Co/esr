import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateCreateQuoteInput } from '@esr/schemas';
import {
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'quotes.create');
	const ctx = toTenantContext(companyId);
	const eventId = url.searchParams.get('eventId')?.trim() || '';

	const [events, customers] = await Promise.all([
		getEventRepository().list(ctx, { limit: 200, offset: 0 }),
		getCustomerRepository().list(ctx, { is_active: 1, limit: 200, offset: 0 })
	]);

	let selectedEvent = null;
	if (eventId) {
		selectedEvent = await getEventRepository().findById(ctx, eventId);
		if (!selectedEvent) selectedEvent = null;
	}

	return { events, customers, eventId, selectedEvent };
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'quotes.create');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const event_id = String(form.get('event_id') ?? '').trim();
		const client_id = String(form.get('client_id') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const valid_until = String(form.get('valid_until') ?? '').trim();

		const validation = validateCreateQuoteInput({ client_id, event_id });
		if (!validation.valid) return fail(400, { error: 'Evento y cliente son obligatorios.' });

		const event = await getEventRepository().findById(ctx, event_id);
		if (!event) return fail(404, { error: 'Evento no encontrado en su empresa.' });

		const resolvedClientId = client_id || String(event.client_id || '');
		const customer = await getCustomerRepository().findById(ctx, resolvedClientId);
		if (!customer) return fail(400, { error: 'Cliente no pertenece a su empresa.' });

		const quote = await getQuoteRepository().create(ctx, {
			client_id: resolvedClientId,
			event_id,
			notes: notes || undefined,
			valid_until: valid_until || undefined,
			date: event.date || new Date().toISOString().slice(0, 10),
			status: 'borrador',
			items: [],
			is_active: 1
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'quote.created',
			entity_type: 'quote',
			entity_id: String(quote.id),
			description: `Cotización creada ${quote.quote_number || quote.id}`
		});

		throw redirect(303, `/quotes/${quote.id}`);
	}
};
