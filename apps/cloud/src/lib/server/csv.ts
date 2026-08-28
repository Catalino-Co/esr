export function escapeCsvCell(value: unknown): string {
	const text = String(value ?? '').replace(/"/g, '""');
	return `"${text}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
	const lines = [headers.map(escapeCsvCell).join(',')];
	for (const row of rows) {
		lines.push(row.map(escapeCsvCell).join(','));
	}
	return lines.join('\n');
}
