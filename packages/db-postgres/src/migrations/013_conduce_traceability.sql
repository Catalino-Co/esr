-- Fase 4 — Lo que hace falta para poder DESHACER un conduce.
--
-- La migracion 011 dejo las columnas de anulacion (`cancelled_at`,
-- `cancel_reason`, `cancel_mode`) pero no lo que hace falta para revertir la
-- operacion. Al ir a escribirlo salieron tres agujeros: el conduce registra
-- QUE se movio y CUANTO, pero no CUALES unidades ni CON QUE resultado, y las
-- incidencias que genera una devolucion no apuntan a ella.
--
-- Sin esto, tres de los siete efectos a revertir son inalcanzables:
--
--   * Los seriales se escriben en `work_order_item_serials`, que esta indexada
--     por ORDEN, no por conduce. Con dos entregas parciales de un articulo
--     serializado no hay forma de saber que unidades salieron en cual.
--   * `incidents` no tiene `conduce_id`: al revertir una devolucion no se sabe
--     que incidencias creo.
--   * La condicion de cada linea devuelta (`dañado`, `perdido`, `devuelto`) se
--     aplica a `work_order_items.status` y se pierde. Al revertir UNA de varias
--     devoluciones no hay con que recalcular el estado que queda.

-- ── Que unidades concretas movio cada conduce ─────────────────────────────
CREATE TABLE IF NOT EXISTS conduce_item_serials (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	conduce_id BIGINT NOT NULL REFERENCES conduces(id) ON DELETE CASCADE,
	conduce_item_id BIGINT REFERENCES conduce_items(id) ON DELETE CASCADE,
	item_id BIGINT NOT NULL REFERENCES items(id),
	serial_id BIGINT NOT NULL REFERENCES item_serials(id),
	UNIQUE (conduce_id, serial_id)
);

CREATE INDEX IF NOT EXISTS conduce_item_serials_conduce_idx
	ON conduce_item_serials (company_id, conduce_id);
CREATE INDEX IF NOT EXISTS conduce_item_serials_serial_idx
	ON conduce_item_serials (company_id, serial_id);

-- Backfill posible SOLO cuando no hay ambiguedad: si la orden tiene una unica
-- entrega que incluya ese articulo, el serial salio por fuerza en ella. Si hay
-- dos o mas, la fila se queda sin atribuir a proposito —inventar una seria
-- peor que no tenerla— y la anulacion en modo operacion la rechazara.
INSERT INTO conduce_item_serials (company_id, conduce_id, conduce_item_id, item_id, serial_id)
SELECT wois.company_id, unica.conduce_id, unica.conduce_item_id, wois.item_id, wois.serial_id
FROM work_order_item_serials wois
JOIN LATERAL (
	SELECT ci.conduce_id, ci.id AS conduce_item_id, COUNT(*) OVER () AS candidatas
	FROM conduce_items ci
	JOIN conduces co ON co.id = ci.conduce_id AND co.company_id = ci.company_id
	WHERE ci.company_id = wois.company_id
	  AND co.work_order_id = wois.work_order_id
	  AND ci.item_id = wois.item_id
	  AND co.conduce_type <> 'devolucion'
) unica ON unica.candidatas = 1
ON CONFLICT (conduce_id, serial_id) DO NOTHING;

-- ── Con que resultado volvio cada linea ───────────────────────────────────
--
-- Solo lo escriben las lineas de DEVOLUCION. Las anteriores a esta migracion se
-- quedan en NULL, y eso es justo lo que la anulacion comprueba para negarse:
-- sin la condicion no se puede recalcular el estado que debe quedar.
ALTER TABLE conduce_items ADD COLUMN IF NOT EXISTS return_condition TEXT;

-- ── Que conduce genero cada incidencia ────────────────────────────────────
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS conduce_id BIGINT;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_conduce_id_fkey;
ALTER TABLE incidents ADD CONSTRAINT incidents_conduce_id_fkey
	FOREIGN KEY (conduce_id) REFERENCES conduces(id);
CREATE INDEX IF NOT EXISTS incidents_conduce_idx ON incidents (company_id, conduce_id);

-- ── Los dos modos de anulacion, renombrados ───────────────────────────────
--
-- La 011 los llamo 'comercial' y 'error' cuando el conduce era el documento de
-- dinero. La 012 se llevo el dinero a la factura, asi que 'comercial' dejo de
-- describir nada: el conduce es hoy una nota de entrega y sus dos modos son
-- anular el DOCUMENTO o deshacer la OPERACION. Ninguna fila los usa todavia,
-- de modo que el renombrado no arrastra datos.
ALTER TABLE conduces DROP CONSTRAINT IF EXISTS conduces_cancel_mode_valid;
UPDATE conduces SET cancel_mode = 'documento' WHERE cancel_mode = 'comercial';
UPDATE conduces SET cancel_mode = 'operacion' WHERE cancel_mode = 'error';
ALTER TABLE conduces ADD CONSTRAINT conduces_cancel_mode_valid
	CHECK (cancel_mode IS NULL OR cancel_mode IN ('documento', 'operacion'));

-- Las lineas de un conduce anulado se marcan; hasta ahora `status` solo tenia
-- 'pending' y 'completed'.
CREATE INDEX IF NOT EXISTS conduce_items_conduce_idx ON conduce_items (company_id, conduce_id);
