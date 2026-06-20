export type RepositoryContext = {
	companyId: string;
};

export function requireCompanyId(ctx: RepositoryContext): string {
	const companyId = ctx?.companyId?.trim();
	if (!companyId) throw new Error('companyId is required for tenant-scoped operations.');
	return companyId;
}
