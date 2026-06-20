export type PaginationInput = { limit?: number; offset?: number };

export function appendPagination(params: unknown[], input: PaginationInput): string {
	let sql = '';
	if (input.limit != null) {
		const limit = Math.max(1, Math.min(200, Math.trunc(input.limit)));
		params.push(limit);
		sql += ` LIMIT $${params.length}`;
	}
	if (input.offset != null) {
		const offset = Math.max(0, Math.trunc(input.offset));
		params.push(offset);
		sql += ` OFFSET $${params.length}`;
	}
	return sql;
}
