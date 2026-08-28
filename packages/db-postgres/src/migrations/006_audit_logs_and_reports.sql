-- ESR Cloud Phase 7: audit logs for critical actions.

CREATE TABLE IF NOT EXISTS audit_logs (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
	action TEXT NOT NULL,
	entity_type TEXT NOT NULL,
	entity_id TEXT NULL,
	description TEXT NULL,
	metadata JSONB NULL,
	ip_address TEXT NULL,
	user_agent TEXT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_company_id_idx ON audit_logs (company_id);
CREATE INDEX IF NOT EXISTS audit_logs_company_created_at_idx ON audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_company_entity_idx ON audit_logs (company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_company_action_idx ON audit_logs (company_id, action);
