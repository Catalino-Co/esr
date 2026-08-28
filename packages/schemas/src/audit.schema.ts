import type { ESRId } from './shared';

export type AuditLogAction = string;

export type AuditEntityType =
	| 'customer'
	| 'inventory'
	| 'event'
	| 'quote'
	| 'order'
	| 'conduce'
	| 'incident'
	| 'checklist'
	| 'document'
	| 'report'
	| string;

export type AuditLog = {
	id?: ESRId;
	company_id?: string;
	user_id?: ESRId | null;
	action: AuditLogAction;
	entity_type: AuditEntityType;
	entity_id?: string | null;
	description?: string | null;
	metadata?: Record<string, unknown> | null;
	ip_address?: string | null;
	user_agent?: string | null;
	created_at?: string;
};

export type CreateAuditLogInput = {
	action: AuditLogAction;
	entity_type: AuditEntityType;
	entity_id?: string | null;
	description?: string | null;
	metadata?: Record<string, unknown> | null;
	ip_address?: string | null;
	user_agent?: string | null;
};

export type AuditLogListFilters = {
	action?: string;
	entity_type?: string;
	user_id?: ESRId;
	date_from?: string;
	date_to?: string;
	limit?: number;
	offset?: number;
};
