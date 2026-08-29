-- Fase 8d — Paquetes y seriales por empresa.
--
-- Igual que los catalogos de la 007, estas tablas venian del modelo de una sola
-- empresa: la 002 les agrego `company_id` pero no ajusto sus restricciones.

-- Un numero de serie identifica una unidad fisica concreta. Repetirlo dentro
-- del mismo articulo haria imposible saber cual salio a un evento.
CREATE UNIQUE INDEX IF NOT EXISTS item_serials_company_item_number_unique
	ON item_serials (company_id, item_id, UPPER(TRIM(serial_number)));

CREATE INDEX IF NOT EXISTS item_serials_company_id_idx ON item_serials (company_id);
CREATE INDEX IF NOT EXISTS item_serials_item_id_idx ON item_serials (company_id, item_id);
CREATE INDEX IF NOT EXISTS item_serials_status_idx ON item_serials (company_id, status);

ALTER TABLE item_serials DROP CONSTRAINT IF EXISTS item_serials_status_valid;
ALTER TABLE item_serials ADD CONSTRAINT item_serials_status_valid
	CHECK (status IN ('disponible', 'reservado', 'entregado', 'mantenimiento', 'retirado'));

-- Nombre de paquete unico por empresa, normalizado como en los catalogos.
CREATE UNIQUE INDEX IF NOT EXISTS packages_company_name_unique
	ON packages (company_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS packages_company_id_idx ON packages (company_id);

-- Un articulo aparece una sola vez por paquete; si se repite se suma cantidad.
CREATE UNIQUE INDEX IF NOT EXISTS package_items_company_package_item_unique
	ON package_items (company_id, package_id, item_id);

CREATE INDEX IF NOT EXISTS package_items_package_id_idx ON package_items (company_id, package_id);

ALTER TABLE package_items DROP CONSTRAINT IF EXISTS package_items_quantity_positive;
ALTER TABLE package_items ADD CONSTRAINT package_items_quantity_positive CHECK (quantity > 0);

-- La asignacion de seriales a una orden necesita `company_id` para poder
-- filtrarse sin cruzar con work_orders en cada consulta.
ALTER TABLE work_order_item_serials ADD COLUMN IF NOT EXISTS company_id UUID;

UPDATE work_order_item_serials wois
SET company_id = wo.company_id
FROM work_orders wo
WHERE wo.id = wois.work_order_id AND wois.company_id IS NULL;

CREATE INDEX IF NOT EXISTS work_order_item_serials_company_idx
	ON work_order_item_serials (company_id, work_order_id);
CREATE INDEX IF NOT EXISTS work_order_item_serials_serial_idx
	ON work_order_item_serials (company_id, serial_id);
