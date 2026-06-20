import type { ESRId } from '@esr/schemas';
import type { ChecklistItem } from './repositories';

export type ExistingIncidentKey = `${ESRId}:daño` | `${ESRId}:faltante`;

export type AutomaticIncidentCandidate = {
	item: ChecklistItem;
	type: 'daño' | 'faltante';
	description: string;
};

export function hasMissingQuantity(item: Pick<ChecklistItem, 'actual_quantity' | 'expected_quantity'>): boolean {
	return Number(item.actual_quantity || 0) < Number(item.expected_quantity || 0);
}

export function isChecklistIncidentItem(item: ChecklistItem, type: 'salida' | 'retorno'): boolean {
	return Boolean(item.is_damaged) || Boolean(item.is_missing) || (type === 'retorno' && hasMissingQuantity(item));
}

export function normalizeChecklistItemForSave(item: ChecklistItem, type: 'salida' | 'retorno'): ChecklistItem {
	const isMissing = Boolean(item.is_missing) || (type === 'retorno' && hasMissingQuantity(item));
	return {
		...item,
		is_damaged: Boolean(item.is_damaged),
		is_missing: isMissing,
		actual_quantity: Number(item.actual_quantity || 0),
		expected_quantity: Number(item.expected_quantity || 0)
	};
}

export function calculateChecklistSummary(items: ChecklistItem[], type: 'salida' | 'retorno') {
	const totalItems = items.length;
	const itemsIncident = items.filter((item) => isChecklistIncidentItem(item, type)).length;
	const itemsOk = items.filter((item) => Number(item.actual_quantity || 0) >= Number(item.expected_quantity || 0) && !isChecklistIncidentItem(item, type)).length;
	const itemsWarning = items.filter((item) => Number(item.actual_quantity || 0) < Number(item.expected_quantity || 0) && !isChecklistIncidentItem(item, type)).length;

	return { totalItems, itemsOk, itemsWarning, itemsIncident };
}

export function completeChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
	return items.map((item) => ({ ...item, actual_quantity: item.expected_quantity }));
}

export function clearChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
	return items.map((item) => ({ ...item, actual_quantity: 0 }));
}

export function toggleChecklistItemComplete(item: ChecklistItem): ChecklistItem {
	return {
		...item,
		actual_quantity: Number(item.actual_quantity || 0) >= Number(item.expected_quantity || 0) ? 0 : item.expected_quantity
	};
}

export function buildAutomaticIncidentCandidates(input: {
	items: ChecklistItem[];
	existingKeys: Set<string>;
	workOrderId: ESRId;
}): AutomaticIncidentCandidate[] {
	const candidates: AutomaticIncidentCandidate[] = [];

	for (const item of input.items) {
		const normalized = normalizeChecklistItemForSave(item, 'retorno');
		const missingQuantity = Math.max(0, Number(normalized.expected_quantity || 0) - Number(normalized.actual_quantity || 0));

		if (normalized.is_damaged && !input.existingKeys.has(`${item.item_id}:daño`)) {
			candidates.push({
				item: normalized,
				type: 'daño',
				description: `[Retorno WO-${String(input.workOrderId).padStart(5, '0')}] ${item.item_name}: daño reportado`
			});
		}

		if (normalized.is_missing && !input.existingKeys.has(`${item.item_id}:faltante`)) {
			const qtyDetail = missingQuantity > 0
				? `faltante de ${missingQuantity} unidad(es) de ${normalized.expected_quantity}`
				: 'faltante reportado';
			candidates.push({
				item: normalized,
				type: 'faltante',
				description: `[Retorno WO-${String(input.workOrderId).padStart(5, '0')}] ${item.item_name}: ${qtyDetail}`
			});
		}
	}

	return candidates;
}
