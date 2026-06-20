import { fail, ok, type UseCaseResult } from '../shared/result';
import type { PackageDraft, PackageItem } from './repositories';

export function validatePackageDraft(input: Pick<PackageDraft, 'name'>): UseCaseResult<Pick<PackageDraft, 'name'>> {
	return input.name?.trim() ? ok(input) : fail('package.name.required');
}

export function isPackageItemOverStock(item: Pick<PackageItem, 'quantity' | 'available_quantity'>): boolean {
	return Number(item.quantity || 0) > Number(item.available_quantity || 0);
}

export function mergePackageItem(items: PackageItem[], item: PackageItem): PackageItem[] {
	const existing = items.find((line) => line.item_id === item.item_id);
	if (!existing) return [...items, { ...item }];

	return items.map((line) =>
		line.item_id === item.item_id
			? { ...line, quantity: Number(line.quantity || 0) + Number(item.quantity || 0) }
			: line
	);
}
