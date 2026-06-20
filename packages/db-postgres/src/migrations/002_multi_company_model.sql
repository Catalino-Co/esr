-- ESR Cloud Phase 1: tenant model and company_id isolation.
-- Existing operational rows are assigned to a legacy company so this migration
-- can make company_id mandatory without discarding business data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL,
	slug TEXT UNIQUE NOT NULL,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO companies (id, name, slug, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Legacy Company', 'legacy', 'active')
ON CONFLICT (id) DO NOTHING;

-- Upgrade users created by the previous PostgreSQL prototype. Password values
-- are intentionally not copied: Cloud accounts must be reset with a real hash.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE users
SET email = COALESCE(email, 'user-' || id || '@migration.local'),
	password_hash = COALESCE(password_hash, '!password-reset-required!'),
	status = COALESCE(status, 'active'),
	created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
	updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN status SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
	) THEN
		ALTER TABLE users DROP COLUMN password;
	END IF;
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
	) THEN
		ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
	END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

CREATE TABLE IF NOT EXISTS company_members (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id UUID NOT NULL REFERENCES companies(id),
	user_id BIGINT NOT NULL REFERENCES users(id),
	role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS company_members_company_id_idx ON company_members (company_id);
CREATE INDEX IF NOT EXISTS company_members_user_id_idx ON company_members (user_id);

-- These are the current ESR table names. They map to the conceptual Cloud names:
-- clients/customers, items/inventory_items, quotations/quotes,
-- work_orders/rental_orders, conduces/delivery_notes and company_info/settings.
DO $$
DECLARE
	tenant_table TEXT;
	constraint_name TEXT;
BEGIN
	FOREACH tenant_table IN ARRAY ARRAY[
		'clients', 'event_types', 'categories', 'subcategories', 'events',
		'items', 'item_serials', 'packages', 'package_items',
		'quotations', 'quotation_items', 'work_orders', 'work_order_items',
		'work_order_item_serials', 'work_order_stock_reservations',
		'conduces', 'conduce_items', 'work_order_checklists', 'incidents',
		'collaborators', 'suppliers', 'company_info'
	]
	LOOP
		EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id UUID', tenant_table);
		EXECUTE format(
			'UPDATE %I SET company_id = $1 WHERE company_id IS NULL',
			tenant_table
		) USING '00000000-0000-0000-0000-000000000001'::UUID;
		EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL', tenant_table);

		constraint_name := tenant_table || '_company_id_fkey';
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conname = constraint_name AND conrelid = to_regclass(tenant_table)
		) THEN
			EXECUTE format(
				'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES companies(id)',
				tenant_table,
				constraint_name
			);
		END IF;

		EXECUTE format(
			'CREATE INDEX IF NOT EXISTS %I ON %I (company_id)',
			tenant_table || '_company_id_idx',
			tenant_table
		);
	END LOOP;
END $$;

-- company_info used id=1 as a global singleton. It is now one row per company.
ALTER TABLE company_info DROP CONSTRAINT IF EXISTS company_info_pkey;
ALTER TABLE company_info ADD CONSTRAINT company_info_pkey PRIMARY KEY (company_id, id);

CREATE TABLE IF NOT EXISTS contracts (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	client_id BIGINT REFERENCES clients(id),
	event_id BIGINT REFERENCES events(id),
	quotation_id BIGINT REFERENCES quotations(id),
	number TEXT,
	date TEXT,
	status TEXT NOT NULL DEFAULT 'borrador',
	terms TEXT,
	notes TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payments (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	client_id BIGINT REFERENCES clients(id),
	quotation_id BIGINT REFERENCES quotations(id),
	contract_id BIGINT REFERENCES contracts(id),
	date TEXT,
	amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
	method TEXT,
	reference TEXT,
	status TEXT NOT NULL DEFAULT 'pendiente',
	notes TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_movements (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	item_id BIGINT NOT NULL REFERENCES items(id),
	work_order_id BIGINT REFERENCES work_orders(id),
	type TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	reference TEXT,
	notes TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS contracts_company_id_idx ON contracts (company_id);
CREATE INDEX IF NOT EXISTS payments_company_id_idx ON payments (company_id);
CREATE INDEX IF NOT EXISTS stock_movements_company_id_idx ON stock_movements (company_id);
CREATE INDEX IF NOT EXISTS clients_company_name_idx ON clients (company_id, name);
CREATE INDEX IF NOT EXISTS events_company_status_idx ON events (company_id, status);
CREATE INDEX IF NOT EXISTS events_company_date_idx ON events (company_id, date);
CREATE INDEX IF NOT EXISTS items_company_name_idx ON items (company_id, name);
CREATE INDEX IF NOT EXISTS items_company_status_idx ON items (company_id, status);
CREATE INDEX IF NOT EXISTS quotations_company_status_idx ON quotations (company_id, status);
CREATE INDEX IF NOT EXISTS quotations_company_created_at_idx ON quotations (company_id, created_at);
CREATE INDEX IF NOT EXISTS work_orders_company_status_idx ON work_orders (company_id, status);
CREATE INDEX IF NOT EXISTS work_orders_company_created_at_idx ON work_orders (company_id, created_at);
CREATE INDEX IF NOT EXISTS incidents_company_status_idx ON incidents (company_id, status);
