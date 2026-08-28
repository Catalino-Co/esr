import type { RequestEvent } from '@sveltejs/kit';
import type { CreateAuditLogInput } from '@esr/schemas';
import { getAuditLogRepository } from './repositories';
import { toTenantContext } from './tenant';

export async function recordAuditLog(
	event: Pick<RequestEvent, 'locals' | 'getClientAddress' | 'request'>,
	input: CreateAuditLogInput
): Promise<void> {
	const companyId = event.locals.companyId;
	const userId = event.locals.user?.id;
	if (!companyId) return;

	try {
		const ctx = { ...toTenantContext(companyId), userId: userId ?? null };
		await getAuditLogRepository().create(ctx, {
			...input,
			ip_address: event.getClientAddress?.() ?? null,
			user_agent: event.request.headers.get('user-agent')
		});
	} catch (error) {
		console.error('[audit] Failed to record log:', error instanceof Error ? error.message : error);
	}
}
