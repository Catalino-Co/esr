-- Fase 8b — Catalogos por empresa.
--
-- `event_types` venia del modelo de una sola empresa con `name TEXT UNIQUE`.
-- La migracion 002 le agrego `company_id` pero nunca toco esa restriccion, asi
-- que el UNIQUE seguia siendo GLOBAL: la segunda empresa que intentara crear
-- "Boda" chocaba contra el tipo de otra empresa, y ademas revelaba que ese
-- nombre ya existia en algun sitio. Se reemplaza por uno por empresa.
ALTER TABLE event_types DROP CONSTRAINT IF EXISTS event_types_name_key;

-- Los indices unicos van sobre el nombre normalizado (sin espacios sobrantes y
-- en minusculas) para que "Boda" y "boda " no puedan convivir en la misma
-- empresa. Se crean como indice y no como constraint porque llevan expresion.
CREATE UNIQUE INDEX IF NOT EXISTS event_types_company_name_unique
	ON event_types (company_id, LOWER(TRIM(name)));

CREATE UNIQUE INDEX IF NOT EXISTS categories_company_name_unique
	ON categories (company_id, LOWER(TRIM(name)));

-- Una subcategoria solo tiene que ser unica dentro de su categoria.
CREATE UNIQUE INDEX IF NOT EXISTS subcategories_company_category_name_unique
	ON subcategories (company_id, category_id, LOWER(TRIM(name)));

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_name_unique
	ON suppliers (company_id, LOWER(TRIM(name)));

CREATE UNIQUE INDEX IF NOT EXISTS collaborators_company_name_unique
	ON collaborators (company_id, LOWER(TRIM(name)));

-- Indices de lectura: los catalogos se listan siempre filtrando por empresa.
CREATE INDEX IF NOT EXISTS event_types_company_id_idx ON event_types (company_id);
CREATE INDEX IF NOT EXISTS categories_company_id_idx ON categories (company_id);
CREATE INDEX IF NOT EXISTS subcategories_company_id_idx ON subcategories (company_id);
CREATE INDEX IF NOT EXISTS suppliers_company_id_idx ON suppliers (company_id);
CREATE INDEX IF NOT EXISTS collaborators_company_id_idx ON collaborators (company_id);
