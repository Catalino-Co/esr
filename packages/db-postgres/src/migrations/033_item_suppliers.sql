-- Varios proveedores por artículo.
--
-- `items.supplier_id` era UN solo proveedor. Un artículo puede comprarse a
-- más de uno, y hacía falta poder registrarlos todos, no solo el último que
-- se haya escrito ahí. Se queda la columna vieja sin usarse —mismo criterio
-- que con `items.description`— y esta tabla puente es la fuente nueva.
--
-- `is_primary` es el proveedor preferido de ESE artículo, no del catálogo de
-- proveedores en general: el mismo proveedor puede ser principal en un
-- artículo y secundario en otro.
CREATE TABLE IF NOT EXISTS item_suppliers (
	company_id UUID NOT NULL REFERENCES companies(id),
	item_id BIGINT NOT NULL REFERENCES items(id),
	supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
	is_primary INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (company_id, item_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS item_suppliers_company_item_idx ON item_suppliers (company_id, item_id);

-- Respaldo: el proveedor único que ya tuviera cada artículo, como principal.
INSERT INTO item_suppliers (company_id, item_id, supplier_id, is_primary)
SELECT company_id, id, supplier_id, 1
FROM items
WHERE supplier_id IS NOT NULL
ON CONFLICT (company_id, item_id, supplier_id) DO NOTHING;
