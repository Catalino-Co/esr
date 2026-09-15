-- Codigo unico por empresa, solo cuando existe: un articulo sin codigo no
-- deberia poder chocar con otro, asi que el indice es PARCIAL.
CREATE UNIQUE INDEX IF NOT EXISTS items_company_internal_code_unique
	ON items (company_id, internal_code) WHERE internal_code IS NOT NULL;
