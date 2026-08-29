import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type QuoteStatus = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'cancelada' | 'convertida' | 'vencida' | string;

export type Quote = {
	id?: Nullable<ESRId>;
	company_id?: string;
	client_id: ESRId | '';
	event_id?: Nullable<ESRId>;
	quote_number?: string;
	date?: string;
	validity_days?: number;
	valid_until?: string;
	subtotal?: number;
	discount?: number;
	tax_amount?: number;
	total?: number;
	status?: QuoteStatus;
	notes?: string;
	conditions?: string;
	is_active?: number;
	created_at?: string;
	confirmed_at?: string;
	cancelled_at?: string;
};

export type QuoteItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	quote_id?: ESRId;
	quotation_id?: ESRId;
	item_id?: Nullable<ESRId>;
	package_id?: Nullable<ESRId>;
	name?: string;
	code?: string | null;
	quantity: number;
	price: number;
	total?: number;
	is_package?: boolean;
	/**
	 * Ventana de alquiler de esta linea, cuando difiere de la del evento.
	 * Columnas `start_date`/`end_date` de `quotation_items` (migracion 004).
	 * Se propagan a la orden y a la reserva de stock al convertir la
	 * cotizacion, y son las fechas con las que se comprueba disponibilidad.
	 */
	start_date?: Nullable<string>;
	end_date?: Nullable<string>;
};

export function validateQuoteInput(quote: Pick<Quote, 'client_id'>): ValidationResult {
	return isPresent(quote.client_id) ? valid() : invalid('quote.client_id.required');
}

export function validateCreateQuoteInput(input: {
	client_id?: unknown;
	event_id?: unknown;
}): ValidationResult {
	if (!isPresent(input.client_id)) return invalid('quote.client_id.required');
	if (!isPresent(input.event_id)) return invalid('quote.event_id.required');
	return valid();
}

export function validateAddQuoteItemInput(input: {
	item_id?: unknown;
	quantity?: unknown;
	price?: unknown;
}): ValidationResult {
	if (!isPresent(input.item_id)) return invalid('quote_item.item_id.required');
	const quantity = Number(input.quantity);
	if (!Number.isFinite(quantity) || quantity <= 0) return invalid('quote_item.quantity.invalid');
	const price = Number(input.price);
	if (!Number.isFinite(price) || price < 0) return invalid('quote_item.price.invalid');
	return valid();
}
