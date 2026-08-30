import { validateQuoteInput, type Quote, type QuoteItem, type QuoteStatus } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

/**
 * Redondeo a dos decimales, hacia arriba en el empate.
 *
 * Con tasas porcentuales hay fracciones de centimo en cada linea, y el orden
 * importa: se redondea CADA LINEA y luego se suma, no al reves. Motivo: la
 * cifra de cada linea es la que se imprime en el documento, y si el total no
 * es la suma exacta de lo impreso el cliente lo nota.
 *
 * `Number(...)` antes del `Math.round` porque un NUMERIC de PostgreSQL llega
 * como cadena y `'150.00' * 100` funciona por coercion pero `NaN` no avisa.
 */
export function round2(value: number | string | null | undefined): number {
	const n = Number(value) || 0;
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Importe BRUTO de una linea: cantidad por precio, sin descuento ni impuesto.
 *
 * Es lo que significa —y ha significado siempre— la columna
 * `quotation_items.total`, y es lo que suma el `subtotal` de la cotizacion. No
 * cambia de significado con la reforma de descuento e impuesto por linea; lo
 * que se añade es `calculateQuoteLineAmounts`, que parte de aqui.
 */
export function calculateQuoteLineTotal(input: Pick<QuoteItem, 'quantity' | 'price'>): number {
	return round2(Number(input.quantity || 0) * Number(input.price || 0));
}

export type QuoteLineAmounts = {
	/** Cantidad x precio. */
	gross: number;
	/** Lo que rebaja `discount_rate` sobre el bruto. */
	discount: number;
	/** Base imponible: bruto menos descuento. */
	taxable: number;
	/** Lo que añade `tax_rate` sobre la base. */
	tax: number;
	/** Lo que se cobra por esta linea: base mas impuesto. Es el «Importe». */
	total: number;
};

/**
 * El desglose de UNA linea.
 *
 * `discount_rate` y `tax_rate` son PORCENTAJES (18 es el ITBIS), no importes.
 * Antes de esta reforma el descuento y el impuesto eran dos importes sueltos
 * en la cabecera de la cotizacion, tecleados a mano y sin relacion con lo
 * cotizado; ahora salen de cada linea y la cabecera solo guarda la suma.
 *
 * El orden es descuento PRIMERO e impuesto despues, sobre la base ya rebajada.
 * Al reves se cobraria impuesto sobre dinero que no se cobra.
 */
export function calculateQuoteLineAmounts(
	line: Pick<QuoteItem, 'quantity' | 'price' | 'total' | 'discount_rate' | 'tax_rate'>
): QuoteLineAmounts {
	// `?? calculateQuoteLineTotal(line)` y no `|| ...`: una linea con bruto 0 es
	// legitima —un articulo de cortesia— y con `||` se recalcularia.
	const gross = round2(line.total ?? calculateQuoteLineTotal(line));
	const discount = round2((gross * (Number(line.discount_rate) || 0)) / 100);
	const taxable = round2(gross - discount);
	const tax = round2((taxable * (Number(line.tax_rate) || 0)) / 100);

	return { gross, discount, taxable, tax, total: round2(taxable + tax) };
}

export type QuoteTotals = {
	subtotal: number;
	discount: number;
	tax_amount: number;
	total: number;
};

/**
 * Los totales de la cotizacion, que ahora son SUMAS y no entradas.
 *
 * La firma perdio los parametros `discount` y `taxAmount`: ya no hay nada que
 * teclear. `quotations.discount` y `quotations.tax_amount` siguen existiendo,
 * pero como resultado calculado —lo que se imprime en el documento— y no como
 * dato de entrada.
 *
 * Identidad que sostiene el bloque de totales:
 *   total === subtotal - discount + tax_amount === suma de los importes
 */
export function calculateQuoteTotals(
	items: Pick<QuoteItem, 'quantity' | 'price' | 'total' | 'discount_rate' | 'tax_rate'>[]
): QuoteTotals {
	let subtotal = 0;
	let discount = 0;
	let tax_amount = 0;

	for (const item of items || []) {
		const linea = calculateQuoteLineAmounts(item);
		subtotal += linea.gross;
		discount += linea.discount;
		tax_amount += linea.tax;
	}

	subtotal = round2(subtotal);
	discount = round2(discount);
	tax_amount = round2(tax_amount);

	return { subtotal, discount, tax_amount, total: round2(subtotal - discount + tax_amount) };
}

export function addInventoryItemToQuote<T extends QuoteItem>(
	items: T[],
	item: Pick<T, 'id' | 'name'> & { code?: string | null; rental_price?: number },
	quantity: number
): T[] {
	const qty = Number(quantity) || 1;
	const existing = items.find((line) => !line.is_package && line.id === item.id);

	if (existing) {
		return items.map((line) => {
			if (line.is_package || line.id !== item.id) return line;
			const nextQuantity = Number(line.quantity || 0) + qty;
			return { ...line, quantity: nextQuantity, total: nextQuantity * Number(line.price || 0) };
		});
	}

	const price = Number(item.rental_price || 0);
	return [
		...items,
		{
			is_package: false,
			id: item.id,
			name: item.name,
			code: item.code ?? null,
			quantity: qty,
			price,
			total: qty * price
		} as T
	];
}

export function addPackageToQuote<T extends QuoteItem>(
	items: T[],
	pkg: Pick<T, 'id' | 'name'> & { price?: number },
	quantity = 1
): T[] {
	const qty = Number(quantity) || 1;
	const existing = items.find((line) => line.is_package && line.id === pkg.id);

	if (existing) {
		return items.map((line) => {
			if (!line.is_package || line.id !== pkg.id) return line;
			const nextQuantity = Number(line.quantity || 0) + qty;
			return { ...line, quantity: nextQuantity, total: nextQuantity * Number(line.price || 0) };
		});
	}

	const price = Number(pkg.price || 0);
	return [
		...items,
		{
			is_package: true,
			id: pkg.id,
			name: pkg.name,
			code: null,
			quantity: qty,
			price,
			total: qty * price
		} as T
	];
}

export function recalculateQuoteItemLine<T extends QuoteItem>(items: T[], index: number): T[] {
	return items.map((item, itemIndex) =>
		itemIndex === index ? { ...item, total: calculateQuoteLineTotal(item) } : item
	);
}

export function removeQuoteItemLine<T extends QuoteItem>(items: T[], index: number): T[] {
	return items.filter((_, itemIndex) => itemIndex !== index);
}

export function validateQuoteDraft(input: { client_id: unknown }): UseCaseResult<{ client_id: unknown }> {
	const validation = validateQuoteInput(input as { client_id: never });
	if (!validation.valid) return fail(validation.issues[0] || 'quote.invalid');
	return ok(input);
}

export function validateQuoteCanApprove(quote: Pick<Quote, 'status'>, items: QuoteItem[]): UseCaseResult<true> {
	if (quote.status === 'cancelada' || quote.status === 'convertida') {
		return fail('quote.cannot_approve_status');
	}
	if (!items.length) return fail('quote.items.required');
	return ok(true);
}

export function validateQuoteCanConvert(quote: Pick<Quote, 'status'>, items: QuoteItem[]): UseCaseResult<true> {
	if (quote.status !== 'aprobada') return fail('quote.must_be_approved');
	if (quote.status === 'convertida') return fail('quote.already_converted');
	if (!items.length) return fail('quote.items.required');
	return ok(true);
}

export function validateQuoteCanEdit(quote: Pick<Quote, 'status'>): UseCaseResult<true> {
	if (quote.status === 'convertida' || quote.status === 'cancelada') {
		return fail('quote.cannot_edit_status');
	}
	return ok(true);
}

export const QUOTE_EDITABLE_STATUSES: QuoteStatus[] = ['borrador', 'enviada', 'aprobada'];
