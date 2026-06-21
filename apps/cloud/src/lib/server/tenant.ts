import type { RepositoryContext } from '@esr/core';

export function toTenantContext(companyId: string): RepositoryContext {
	return { companyId };
}
