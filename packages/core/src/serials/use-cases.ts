import type { ESRId, InventoryItem } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export type SerializedLine = {
	item_id: ESRId;
	name?: string;
	quantity: number;
	serial_ids?: ESRId[];
	item_type?: string;
	uses_serial?: number | boolean;
};

export function isSerializedInventoryItem(item?: Pick<InventoryItem, 'item_type' | 'uses_serial'> | null): boolean {
	return item?.item_type === 'serializado' || Number(item?.uses_serial || 0) === 1;
}

export function parseSerialLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((serial) => serial.trim())
		.filter(Boolean);
}

export function uniqueSerialLines(serials: string[]): string[] {
	return [...new Set(serials)];
}

export function normalizeSerializedInventoryInput<T extends InventoryItem>(item: T, serialNumbers: string[]): T {
	if (!isSerializedInventoryItem(item)) {
		return { ...item, item_type: 'cantidad', uses_serial: 0 };
	}

	const uniqueSerials = uniqueSerialLines(serialNumbers);
	return {
		...item,
		item_type: 'serializado',
		uses_serial: 1,
		// Lo DISPONIBLE ya no se guarda: se calcula restando a las existencias lo
		// que retienen las ordenes vivas (migracion 015).
		total_quantity: uniqueSerials.length
	};
}

export function validateSerialCatalogInput(serialNumbers: string[]): UseCaseResult<string[]> {
	const uniqueSerials = uniqueSerialLines(serialNumbers);
	return uniqueSerials.length > 0 ? ok(uniqueSerials) : fail('serials.required');
}

export function normalizeSerializedRentalLine<T extends SerializedLine>(line: T): T {
	if (!isSerializedInventoryItem(line)) return line;
	return {
		...line,
		quantity: line.serial_ids?.length || 0
	};
}

export function validateSerializedRentalLines(lines: SerializedLine[]): UseCaseResult<SerializedLine[]> {
	for (const line of lines) {
		if (isSerializedInventoryItem(line) && (!line.serial_ids || line.serial_ids.length === 0)) {
			return fail(`serials.selection.required:${line.item_id}`);
		}
	}

	return ok(lines.map(normalizeSerializedRentalLine));
}
