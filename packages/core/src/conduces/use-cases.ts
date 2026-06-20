import type { ESRId } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';
import type { ConduceDraft, ConduceLine, ConduceStatus } from './repositories';

export const CONDUCE_STOCK_DEDUCTING_STATUSES = ['emitido', 'entregado'] as const;

export function calculateConduceLineTotal(line: Pick<ConduceLine, 'quantity' | 'price'>): number {
	return Number(line.quantity || 0) * Number(line.price || 0);
}

export function calculateConduceTotals(items: ConduceLine[], discount = 0) {
	const subtotal = items.reduce((sum, item) => {
		const total = item.total ?? calculateConduceLineTotal(item);
		return sum + Number(total || 0);
	}, 0);
	const normalizedDiscount = Number(discount) || 0;

	return {
		subtotal,
		discount: normalizedDiscount,
		total: subtotal - normalizedDiscount
	};
}

export function shouldDeductStockForConduceStatus(status?: ConduceStatus | null): boolean {
	return CONDUCE_STOCK_DEDUCTING_STATUSES.includes(status as never);
}

export function validateConduceDraft(input: Pick<ConduceDraft, 'work_order_id'>): UseCaseResult<Pick<ConduceDraft, 'work_order_id'>> {
	return input.work_order_id ? ok(input) : fail('conduce.work_order_id.required');
}

export function buildConduceReference(id: ESRId | null | undefined): string {
	return `COND-${String(id ?? '').padStart(5, '0')}`;
}
