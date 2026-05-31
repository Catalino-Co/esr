import { validateQuoteInput, type QuoteItem } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export type QuoteTotals = {
	subtotal: number;
	discount: number;
	total: number;
};

export function calculateQuoteLineTotal(input: Pick<QuoteItem, 'quantity' | 'price'>): number {
	return Number(input.quantity || 0) * Number(input.price || 0);
}

export function calculateQuoteTotals(items: Pick<QuoteItem, 'quantity' | 'price' | 'total'>[], discount = 0): QuoteTotals {
	const normalizedItems = items.map((item) => ({
		...item,
		total: item.total ?? calculateQuoteLineTotal(item)
	}));
	const subtotal = normalizedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const normalizedDiscount = Number(discount) || 0;

	return {
		subtotal,
		discount: normalizedDiscount,
		total: subtotal - normalizedDiscount
	};
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
