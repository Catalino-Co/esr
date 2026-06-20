import type { ESRId } from '@esr/schemas';

export type PackageItem = {
	item_id: ESRId;
	quantity: number;
	name?: string;
	internal_code?: string;
	available_quantity?: number;
};

export type PackageDraft = {
	id?: ESRId | null;
	name: string;
	description?: string;
	suggested_price?: number;
	notes?: string;
	items?: PackageItem[];
};

export interface PackageRepository {
	findById(id: ESRId): Promise<PackageDraft | null>;
	create(data: PackageDraft): Promise<PackageDraft>;
	update(id: ESRId, data: PackageDraft): Promise<PackageDraft>;
	replaceItems(packageId: ESRId, items: PackageItem[]): Promise<void>;
}
