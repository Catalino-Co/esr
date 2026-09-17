-- Modulo de Servicios: cosas vendibles que no son un articulo de inventario
-- (una Maestria de Ceremonias, vestirse de Santa...). A diferencia de un
-- Paquete, un Servicio no agrupa articulos y no se "explota" en lineas: es
-- el mismo Servicio, con su propio precio, el que viaja como linea de
-- Cotizacion/Orden/Factura.
--
-- No participa de Entrega/Devolucion/Cierre de orden ni genera movimiento de
-- inventario -no es tangible-, asi que no necesita almacen, unidad de
-- medida ni seriales. Ver `service_id` mas abajo: se agrega como columna
-- hermana de `item_id`, nunca las dos a la vez en la misma linea.
CREATE TABLE IF NOT EXISTS services (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	name TEXT NOT NULL,
	price NUMERIC(12, 2) NOT NULL DEFAULT 0,
	notes TEXT,
	-- Mismo dominio de tres valores que el resto de catalogos (ver migracion 010).
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ
);

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_state_valid;
ALTER TABLE services ADD CONSTRAINT services_state_valid
	CHECK (is_active IN (0, 1, 2));

CREATE UNIQUE INDEX IF NOT EXISTS services_company_name_unique
	ON services (company_id, LOWER(TRIM(name)));
CREATE INDEX IF NOT EXISTS services_company_state_idx ON services (company_id, is_active);

-- Una linea de Cotizacion/Orden/Factura tiene `item_id` O `service_id`, nunca
-- los dos. `package_id` (en quotation_items) sigue aparte: es legado, ya no
-- se escribe en lineas nuevas desde que un Paquete se explota en lineas de
-- articulo al agregarlo.
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS service_id BIGINT REFERENCES services(id);
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS service_id BIGINT REFERENCES services(id);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS service_id BIGINT REFERENCES services(id);

-- `work_order_items.item_id` deja de ser obligatorio: una linea de servicio
-- no tiene articulo real. (La columna ya nacio NULLABLE en el esquema
-- original -001_initial_schema.sql-, asi que no hace falta un ALTER aqui;
-- queda anotado porque es el supuesto que rompe si alguien la endurece.)

-- ── Facturacion de Servicios ──────────────────────────────────────────────
--
-- Una factura se arma hoy copiando conduces (invoice_conduces): una entrega
-- fisica. Un Servicio nunca se entrega, asi que necesita su propio enlace
-- para saber que ya se facturo -mismo mecanismo que invoice_conduces,
-- incluido el indice parcial: anular la factura libera el servicio para
-- volver a facturarlo, en vez de dejarlo preso para siempre-.
CREATE TABLE IF NOT EXISTS invoice_work_order_items (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
	work_order_item_id BIGINT NOT NULL REFERENCES work_order_items(id),
	is_active INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_wo_items_active_unique
	ON invoice_work_order_items (work_order_item_id) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS invoice_wo_items_invoice_idx
	ON invoice_work_order_items (company_id, invoice_id);
