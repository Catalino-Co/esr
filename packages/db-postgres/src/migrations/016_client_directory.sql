-- Modulo de clientes: direcciones de servicio y datos comerciales.
--
-- El cliente solo admitia UNA direccion, y el negocio necesita varias: donde
-- esta el cliente no es donde se presta el servicio. Es el concepto «ship to»
-- aplicado al lugar de la entrega o el montaje.
--
-- OJO con los dos conceptos de direccion, que conviven a proposito:
--
--   * `clients.address`   → direccion FISCAL. Es la que sale en la factura
--                           (`postgres-invoice.repository.ts` la lee como
--                           `client_address`). No se toca ni se migra.
--   * `client_addresses`  → direcciones de SERVICIO. Las nuevas.

-- ══════════════════════════════════════════════════════════════════════════
--  Catalogos nuevos
-- ══════════════════════════════════════════════════════════════════════════
--
-- Mismas columnas que el resto de catalogos simples (proveedores,
-- colaboradores): asi los consume `PostgresCatalogRepository` sin excepciones.

CREATE TABLE IF NOT EXISTS commercial_sectors (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	name TEXT NOT NULL,
	description TEXT,
	is_active INTEGER DEFAULT 1,
	CONSTRAINT commercial_sectors_state_valid CHECK (is_active IN (0, 1, 2))
);

CREATE TABLE IF NOT EXISTS client_address_types (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	name TEXT NOT NULL,
	description TEXT,
	is_active INTEGER DEFAULT 1,
	CONSTRAINT client_address_types_state_valid CHECK (is_active IN (0, 1, 2))
);

-- Unicidad por empresa sobre el nombre normalizado, igual que la 007.
CREATE UNIQUE INDEX IF NOT EXISTS commercial_sectors_company_name_unique
	ON commercial_sectors (company_id, LOWER(TRIM(name)));
CREATE UNIQUE INDEX IF NOT EXISTS client_address_types_company_name_unique
	ON client_address_types (company_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS commercial_sectors_company_id_idx
	ON commercial_sectors (company_id);
CREATE INDEX IF NOT EXISTS client_address_types_company_id_idx
	ON client_address_types (company_id);

-- ══════════════════════════════════════════════════════════════════════════
--  Sembrado de los catalogos
-- ══════════════════════════════════════════════════════════════════════════
--
-- No es un adorno: un desplegable vacio parece una pantalla rota, y el usuario
-- no tiene por que adivinar que primero hay que ir a Configuracion. Se siembra
-- para las empresas que YA existen; para las futuras lo hace `seed.ts`, que es
-- el unico sitio donde se crean empresas.

INSERT INTO commercial_sectors (company_id, name)
SELECT c.id, s.name
FROM companies c
CROSS JOIN (VALUES
	('Eventos'), ('Restaurantes'), ('Hoteles'), ('Manufactura'),
	('Retail'), ('Servicios'), ('Educación')
) AS s(name)
ON CONFLICT DO NOTHING;

INSERT INTO client_address_types (company_id, name)
SELECT c.id, t.name
FROM companies c
CROSS JOIN (VALUES
	('Sucursal'), ('Almacén'), ('Oficina'), ('Salón'), ('Domicilio'), ('Obra')
) AS t(name)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
--  Datos comerciales del cliente
-- ══════════════════════════════════════════════════════════════════════════
--
-- Los tres quedan NULL en los clientes existentes, y asi se quedan. Rellenar
-- `document_type` con 'rnc' porque es lo comun en RD, o `payment_terms` con
-- 'contado', seria escribir una afirmacion fiscal que nadie hizo; y bastaria
-- abrir una ficha vieja y pulsar «Guardar» para que se volviera permanente.
-- La UI los muestra como «Sin especificar».
--
-- `document_type` y `payment_terms` son enums en codigo, no catalogos: el
-- conjunto es fiscal y de pais (DGII), no configurable por empresa, y los
-- consumidores necesitan ramificar sobre el valor —validar el largo del
-- documento, calcular el vencimiento de una factura— cosa imposible contra
-- texto libre.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sector_id BIGINT;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'clients_document_type_valid'
	) THEN
		ALTER TABLE clients ADD CONSTRAINT clients_document_type_valid
			CHECK (document_type IS NULL OR document_type IN ('rnc', 'cedula', 'pasaporte', 'otro'));
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'clients_payment_terms_valid'
	) THEN
		ALTER TABLE clients ADD CONSTRAINT clients_payment_terms_valid
			CHECK (payment_terms IS NULL OR payment_terms IN
				('contado', 'credito_15', 'credito_30', 'credito_60', 'credito_90'));
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'clients_sector_id_fkey'
	) THEN
		-- SET NULL y no CASCADE: archivar un sector no puede borrar clientes.
		ALTER TABLE clients ADD CONSTRAINT clients_sector_id_fkey
			FOREIGN KEY (sector_id) REFERENCES commercial_sectors(id) ON DELETE SET NULL;
	END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
--  Direcciones de servicio
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_addresses (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

	-- El «Detalle»: «Sucursal Herrera», «Plaza Internacional».
	label TEXT NOT NULL,

	-- Nullable A PROPOSITO. Si el tipo fuera obligatorio, una empresa que
	-- archivara todo el catalogo no podria crear ninguna direccion. La UI lo
	-- pide; la base no lo exige.
	address_type_id BIGINT REFERENCES client_address_types(id) ON DELETE SET NULL,

	address TEXT NOT NULL,

	-- NULL significa HEREDA del cliente, y se resuelve al leer con COALESCE.
	-- Copiar el valor al guardar dejaria la direccion congelada cuando cambie
	-- el del cliente; eso es «rellenar», no «heredar». Consecuencia: aqui no se
	-- escribe NUNCA cadena vacia, o se pierde la diferencia entre «heredo» y
	-- «no tiene».
	contact_person TEXT,
	phone TEXT,
	email TEXT,

	-- El celular NO hereda: el cliente no tiene celular.
	mobile TEXT,

	notes TEXT,
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	CONSTRAINT client_addresses_state_valid CHECK (is_active IN (0, 1, 2))
);

CREATE INDEX IF NOT EXISTS client_addresses_company_client_idx
	ON client_addresses (company_id, client_id, is_active);

-- Parcial sobre las no archivadas: asi se puede volver a crear «Sucursal
-- Herrera» despues de haber archivado la vieja.
CREATE UNIQUE INDEX IF NOT EXISTS client_addresses_label_unique
	ON client_addresses (company_id, client_id, LOWER(TRIM(label)))
	WHERE is_active <> 0;

-- ── Por que NO hay indice unico sobre `is_primary` ────────────────────────
--
-- El reflejo es
--   CREATE UNIQUE INDEX ... ON client_addresses (company_id, client_id)
--   WHERE is_primary;
-- y ROMPE de forma intermitente. Marcar una principal implica apagar la
-- anterior, y PostgreSQL valida los indices unicos FILA A FILA durante el
-- UPDATE, no al final de la sentencia: si toca la fila nueva antes que la
-- vieja hay dos TRUE a la vez y salta `duplicate key`. Segun el orden fisico
-- de las filas, unas veces pasa y otras no. Y un indice PARCIAL no puede ser
-- DEFERRABLE (solo las constraints pueden diferirse, y las constraints no
-- pueden ser parciales).
--
-- La invariante la garantiza la forma de la sentencia, que es UNA sola y por
-- tanto atomica:
--
--   UPDATE client_addresses SET is_primary = (id = $3)
--   WHERE company_id = $1 AND client_id = $2;
--
-- Efecto colateral util: ninguna operacion sobre direcciones necesita
-- transaccion, y por eso Desktop puede hacerlas desde el renderer.
