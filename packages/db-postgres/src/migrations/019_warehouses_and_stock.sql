-- Almacenes, unidades de medida y existencias POR ALMACEN.
--
-- Hasta aqui las existencias de un articulo eran UN numero: `items.total_quantity`
-- para los de cantidad, y el recuento de `item_serials` para los serializados.
-- El inventario pasa a verse por almacen, asi que ese numero se reparte.
--
-- El almacen INFORMA, NO RESERVA: cotizar, aprobar, convertir en orden y
-- entregar siguen comprometiendo contra el total de la empresa. Por eso el
-- unico punto que cambia rio abajo es `TOTAL_QUANTITY_SQL` de `availability.ts`,
-- que pasa de leer una columna a sumar `item_stock`. `committedQuantitySql` y
-- toda la cadena de reservas quedan intactas.

-- ── Almacenes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	name TEXT NOT NULL,
	code TEXT,
	address TEXT,
	notes TEXT,
	-- Tres estados como el resto de catalogos: 1 activo, 2 inactivo, 0 archivado.
	is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS warehouses_company_id_idx ON warehouses (company_id);

-- ── Unidades de medida ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units_of_measure (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	name TEXT NOT NULL,
	-- La abreviatura es lo que se pinta junto a la cantidad: «120 ud».
	abbr TEXT,
	is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS units_of_measure_company_id_idx ON units_of_measure (company_id);

-- ── Existencias por almacen ───────────────────────────────────────────────
--
-- Solo para los articulos DE CANTIDAD. En un serializado las existencias son
-- sus unidades registradas, y lo que se reparte por almacen es cada serial:
-- de ahi la columna `warehouse_id` de `item_serials`, mas abajo.
CREATE TABLE IF NOT EXISTS item_stock (
	company_id UUID NOT NULL REFERENCES companies(id),
	item_id BIGINT NOT NULL REFERENCES items(id),
	warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
	quantity INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (company_id, item_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS item_stock_company_item_idx ON item_stock (company_id, item_id);

-- ── Columnas nuevas de `items` ────────────────────────────────────────────
--
-- `suppliers` ya existe y ya tiene su CRUD en las dos apps: aqui solo se enlaza.
ALTER TABLE items ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES suppliers(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS uom_id BIGINT REFERENCES units_of_measure(id);
-- El minimo es UNO POR ARTICULO y se compara contra el total de la empresa:
-- responde «hay que comprar mas», que es una decision de compra y no de almacen.
ALTER TABLE items ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;

-- En un serializado, cada unidad esta en un sitio.
ALTER TABLE item_serials ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouses(id);

-- ── Movimientos ───────────────────────────────────────────────────────────
--
-- `user_id` es el RESPONSABLE, que hasta ahora no se guardaba. Los movimientos
-- anteriores a esta migracion se quedan en NULL y la pantalla los muestra como
-- «Sistema»: inventar un responsable seria peor que no tenerlo.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouses(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS user_id UUID;

-- La pantalla de movimientos filtra por articulo y por fecha.
CREATE INDEX IF NOT EXISTS stock_movements_company_item_idx
	ON stock_movements (company_id, item_id, created_at DESC);

-- ── Volcado ───────────────────────────────────────────────────────────────
--
-- Un almacen «Principal» por empresa, y a el se lleva lo que hoy dice
-- `items.total_quantity`. NEUTRO por construccion: con un solo almacen, la suma
-- de `item_stock` es exactamente el numero que habia.
--
-- `items.total_quantity` NO se borra. Deja de leerse, pero se conserva para
-- poder volver atras: una migracion que destruye el dato de partida no tiene
-- vuelta.
INSERT INTO warehouses (company_id, name, code, is_active)
SELECT c.id, 'Principal', 'PRIN', 1
FROM companies c
WHERE NOT EXISTS (
	SELECT 1 FROM warehouses w WHERE w.company_id = c.id
);

INSERT INTO item_stock (company_id, item_id, warehouse_id, quantity)
SELECT i.company_id, i.id, w.id, COALESCE(i.total_quantity, 0)
FROM items i
JOIN warehouses w ON w.company_id = i.company_id AND w.code = 'PRIN'
-- Los serializados no llevan fila: su total sale de los seriales, y una fila
-- aqui seria un segundo numero contradiciendo al primero.
WHERE i.item_type <> 'serializado'
ON CONFLICT (company_id, item_id, warehouse_id) DO NOTHING;

-- Los seriales existentes se colocan en el almacen principal.
UPDATE item_serials s
SET warehouse_id = w.id
FROM warehouses w
WHERE w.company_id = s.company_id AND w.code = 'PRIN' AND s.warehouse_id IS NULL;

-- ── Unidades sembradas ────────────────────────────────────────────────────
--
-- Las de uso corriente en alquiler de eventos. Se pueden editar y archivar
-- desde Configuracion como cualquier otro catalogo.
INSERT INTO units_of_measure (company_id, name, abbr, is_active)
SELECT c.id, u.name, u.abbr, 1
FROM companies c
CROSS JOIN (VALUES
	('Unidad', 'ud'),
	('Juego', 'jgo'),
	('Par', 'par'),
	('Caja', 'cja'),
	('Metro', 'm'),
	('Metro cuadrado', 'm²'),
	('Rollo', 'rll'),
	('Hora', 'h'),
	('Día', 'día')
) AS u(name, abbr)
WHERE NOT EXISTS (
	SELECT 1 FROM units_of_measure x WHERE x.company_id = c.id AND x.name = u.name
);

-- Todo articulo nace en «Unidad» mientras nadie diga otra cosa.
UPDATE items i
SET uom_id = u.id
FROM units_of_measure u
WHERE u.company_id = i.company_id AND u.name = 'Unidad' AND i.uom_id IS NULL;
