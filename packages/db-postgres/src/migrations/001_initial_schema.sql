CREATE TABLE IF NOT EXISTS users (
	id BIGSERIAL PRIMARY KEY,
	username TEXT UNIQUE NOT NULL,
	password TEXT NOT NULL,
	name TEXT,
	role TEXT DEFAULT 'admin',
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clients (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	document_id TEXT,
	phone TEXT,
	email TEXT,
	address TEXT,
	contact_person TEXT,
	notes TEXT,
	is_active INTEGER DEFAULT 1,
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_types (
	id BIGSERIAL PRIMARY KEY,
	name TEXT UNIQUE NOT NULL,
	color TEXT DEFAULT '#6366f1',
	description TEXT,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	color TEXT DEFAULT '#6366f1',
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subcategories (
	id BIGSERIAL PRIMARY KEY,
	category_id BIGINT REFERENCES categories(id),
	name TEXT NOT NULL,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS events (
	id BIGSERIAL PRIMARY KEY,
	client_id BIGINT REFERENCES clients(id),
	name TEXT NOT NULL,
	event_type TEXT,
	date TEXT,
	departure_time TEXT,
	setup_time TEXT,
	pickup_date TEXT,
	pickup_time TEXT,
	location TEXT,
	responsible_person TEXT,
	notes TEXT,
	quotation_id BIGINT,
	work_order_id BIGINT,
	status TEXT DEFAULT 'tentativo',
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS items (
	id BIGSERIAL PRIMARY KEY,
	internal_code TEXT,
	name TEXT NOT NULL,
	category_id BIGINT REFERENCES categories(id),
	subcategory_id BIGINT REFERENCES subcategories(id),
	description TEXT,
	item_type TEXT DEFAULT 'cantidad',
	uses_serial INTEGER DEFAULT 0,
	total_quantity INTEGER DEFAULT 0,
	available_quantity INTEGER DEFAULT 0,
	rental_price NUMERIC(12, 2) DEFAULT 0,
	internal_cost NUMERIC(12, 2) DEFAULT 0,
	status TEXT DEFAULT 'disponible',
	location TEXT,
	notes TEXT,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS item_serials (
	id BIGSERIAL PRIMARY KEY,
	item_id BIGINT REFERENCES items(id),
	serial_number TEXT NOT NULL,
	status TEXT DEFAULT 'disponible'
);

CREATE TABLE IF NOT EXISTS packages (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	description TEXT,
	suggested_price NUMERIC(12, 2) DEFAULT 0,
	notes TEXT,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS package_items (
	id BIGSERIAL PRIMARY KEY,
	package_id BIGINT REFERENCES packages(id),
	item_id BIGINT REFERENCES items(id),
	quantity INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quotations (
	id BIGSERIAL PRIMARY KEY,
	client_id BIGINT REFERENCES clients(id),
	event_id BIGINT REFERENCES events(id),
	date TEXT,
	validity_days INTEGER DEFAULT 15,
	subtotal NUMERIC(12, 2) DEFAULT 0,
	discount NUMERIC(12, 2) DEFAULT 0,
	total NUMERIC(12, 2) DEFAULT 0,
	status TEXT DEFAULT 'borrador',
	notes TEXT,
	conditions TEXT,
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	is_active INTEGER DEFAULT 1
);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'events_quotation_id_fkey'
	) THEN
		ALTER TABLE events
			ADD CONSTRAINT events_quotation_id_fkey
			FOREIGN KEY (quotation_id) REFERENCES quotations(id) NOT VALID;
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS quotation_items (
	id BIGSERIAL PRIMARY KEY,
	quotation_id BIGINT REFERENCES quotations(id),
	item_id BIGINT REFERENCES items(id),
	package_id BIGINT REFERENCES packages(id),
	quantity INTEGER DEFAULT 1,
	price NUMERIC(12, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_orders (
	id BIGSERIAL PRIMARY KEY,
	client_id BIGINT REFERENCES clients(id),
	event_id BIGINT REFERENCES events(id),
	quotation_id BIGINT REFERENCES quotations(id),
	date TEXT,
	responsible_person TEXT,
	assigned_collaborator_id BIGINT,
	assigned_supplier_id BIGINT,
	vehicle TEXT,
	notes TEXT,
	status TEXT DEFAULT 'pendiente',
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	is_active INTEGER DEFAULT 1
);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'events_work_order_id_fkey'
	) THEN
		ALTER TABLE events
			ADD CONSTRAINT events_work_order_id_fkey
			FOREIGN KEY (work_order_id) REFERENCES work_orders(id) NOT VALID;
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS work_order_items (
	id BIGSERIAL PRIMARY KEY,
	work_order_id BIGINT REFERENCES work_orders(id),
	item_id BIGINT REFERENCES items(id),
	quantity INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS work_order_item_serials (
	id BIGSERIAL PRIMARY KEY,
	work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
	item_id BIGINT NOT NULL REFERENCES items(id),
	serial_id BIGINT NOT NULL REFERENCES item_serials(id),
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (work_order_id, serial_id)
);

CREATE TABLE IF NOT EXISTS work_order_stock_reservations (
	id BIGSERIAL PRIMARY KEY,
	work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
	item_id BIGINT NOT NULL REFERENCES items(id),
	quantity INTEGER NOT NULL DEFAULT 1,
	status TEXT DEFAULT 'reserved',
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (work_order_id, item_id)
);

CREATE TABLE IF NOT EXISTS conduces (
	id BIGSERIAL PRIMARY KEY,
	work_order_id BIGINT REFERENCES work_orders(id),
	client_id BIGINT REFERENCES clients(id),
	date TEXT,
	status TEXT DEFAULT 'emitido',
	driver_or_vehicle TEXT,
	notes TEXT,
	subtotal NUMERIC(12, 2) DEFAULT 0,
	discount NUMERIC(12, 2) DEFAULT 0,
	total NUMERIC(12, 2) DEFAULT 0,
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS conduce_items (
	id BIGSERIAL PRIMARY KEY,
	conduce_id BIGINT REFERENCES conduces(id),
	item_id BIGINT REFERENCES items(id),
	quantity INTEGER DEFAULT 1,
	price NUMERIC(12, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_order_checklists (
	id BIGSERIAL PRIMARY KEY,
	work_order_id BIGINT REFERENCES work_orders(id),
	item_id BIGINT REFERENCES items(id),
	type TEXT,
	expected_quantity INTEGER DEFAULT 0,
	actual_quantity INTEGER DEFAULT 0,
	is_damaged INTEGER DEFAULT 0,
	is_missing INTEGER DEFAULT 0,
	notes TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
	id BIGSERIAL PRIMARY KEY,
	type TEXT,
	item_id BIGINT REFERENCES items(id),
	client_id BIGINT REFERENCES clients(id),
	event_id BIGINT REFERENCES events(id),
	work_order_id BIGINT REFERENCES work_orders(id),
	date TEXT,
	description TEXT,
	severity TEXT,
	estimated_cost NUMERIC(12, 2),
	status TEXT DEFAULT 'reportado',
	notes TEXT,
	created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS collaborators (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	phone TEXT,
	email TEXT,
	role TEXT,
	notes TEXT,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	contact TEXT,
	phone TEXT,
	email TEXT,
	service TEXT,
	notes TEXT,
	is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS company_info (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	name TEXT NOT NULL DEFAULT 'Tu Empresa',
	rnc TEXT,
	phone TEXT,
	email TEXT,
	address TEXT,
	logo_base64 TEXT
);

INSERT INTO company_info (id, name)
VALUES (1, 'Tu Empresa')
ON CONFLICT (id) DO NOTHING;
