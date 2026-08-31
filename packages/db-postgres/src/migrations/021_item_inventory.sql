-- Catalogo e inventario: trazar la frontera.
--
-- Hasta aqui la ficha del articulo mezclaba dos cosas: QUE ES Y CUANTO VALE
-- (definicion y tarifas) con CUANTO HAY, DONDE ESTA Y EN QUE CONDICION. La
-- migracion 019 ya movio medio camino sacando el total a `item_stock`. Lo que
-- queda es el MINIMO, el ESTADO FISICO y la UBICACION.
--
-- Por que una tabla y no dejarlas donde estan: mientras vivan en `items`, toda
-- pantalla de catalogo que lea el articulo lee tambien existencias, y no hay
-- forma de garantizar que editar la ficha no las toque. Separadas, la garantia
-- la da el esquema y no la disciplina de quien escribe el UPDATE.
--
-- UNA FILA POR ARTICULO, no por almacen. El minimo responde «hay que comprar
-- mas», que es una decision de compra de la empresa entera; y el estado fisico
-- de un serializado ya vive con el grano fino en `item_serials.status`.

-- ── Existencias que no son cantidad ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_inventory (
	company_id UUID NOT NULL REFERENCES companies(id),
	item_id BIGINT NOT NULL REFERENCES items(id),
	-- Comparado contra el TOTAL de la empresa, no contra lo disponible hoy: un
	-- articulo con todo alquilado no es stock bajo, esta ocupado.
	min_stock INTEGER NOT NULL DEFAULT 0,
	-- `disponible` | `mantenimiento` | `retirado`. Es la condicion FISICA, que
	-- no tiene nada que ver con `items.is_active`, que es si se puede cotizar.
	physical_status TEXT NOT NULL DEFAULT 'disponible',
	location TEXT,
	PRIMARY KEY (company_id, item_id)
);

CREATE INDEX IF NOT EXISTS item_inventory_company_idx ON item_inventory (company_id);

-- ── Volcado ───────────────────────────────────────────────────────────────
--
-- Una fila por articulo existente, con exactamente lo que ya decia su ficha.
-- NEUTRO por construccion: se copia, no se recalcula.
INSERT INTO item_inventory (company_id, item_id, min_stock, physical_status, location)
SELECT i.company_id, i.id, COALESCE(i.min_stock, 0),
       COALESCE(NULLIF(i.status, ''), 'disponible'), i.location
FROM items i
ON CONFLICT (company_id, item_id) DO NOTHING;

-- Las columnas viejas de `items` NO SE BORRAN aqui. Dejan de leerse y de
-- escribirse; el borrado va en una migracion posterior, una vez verificado.
-- Misma disciplina que con `total_quantity` en la 019: una migracion que
-- destruye el dato de partida no tiene vuelta.

-- ── Costo de cada entrada ─────────────────────────────────────────────────
--
-- Lo que valia la mercancia CUANDO ENTRO. Es una copia, igual que el precio de
-- una linea de cotizacion: cambiar `items.internal_cost` manana no puede
-- reescribir lo que costo una compra de hace tres meses.
--
-- NULL a proposito y no 0: las entradas anteriores a esta reforma no traen
-- costo, y decir «costaron cero» seria un dato inventado. La valoracion las
-- muestra como «—».
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2);

-- ── Regla de valoracion ───────────────────────────────────────────────────
--
-- `ultimo` (el costo de la ultima entrada) o `promedio3` (la media de las tres
-- ultimas). Ajuste de empresa, junto a `default_tax_rate`. Con `ultimo` por
-- defecto, una empresa que no la configure ve la regla mas simple.
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS default_valuation_rule TEXT DEFAULT 'ultimo';
