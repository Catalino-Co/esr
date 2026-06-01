export function createInventoryReportRows(items = []) {
	return items.map((item) => ({
		id: item.id,
		code: item.internal_code || item.code || '',
		name: item.name || item.item_name || '',
		availableQuantity: Number(item.available_quantity ?? item.availableQuantity ?? 0),
		totalQuantity: Number(item.total_quantity ?? item.totalQuantity ?? 0),
		status: item.status || ''
	}));
}

