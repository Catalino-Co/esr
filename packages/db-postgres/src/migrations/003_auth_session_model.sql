-- ESR Cloud Phase 3: persistent sessions for authentication.
-- users.id is BIGINT in the current schema; session user_id matches that type.

CREATE TABLE IF NOT EXISTS user_sessions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	active_company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_seen_at TIMESTAMPTZ NULL,
	user_agent TEXT NULL,
	ip_address TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_company_id ON user_sessions (active_company_id);
