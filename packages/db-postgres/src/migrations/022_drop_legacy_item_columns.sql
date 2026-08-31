-- El borrado fisico de las columnas que se mudaron.
--
-- Va aparte de la 021 a proposito. Aquella COPIO el minimo, el estado fisico y
-- la ubicacion a `item_inventory` y dejo las originales en su sitio; esta las
-- quita, una vez comprobado que nadie las lee. Partirlo en dos migraciones es
-- lo que permite que entre la una y la otra se pueda mirar, comparar y volver
-- atras. Una sola migracion que copia y borra en el mismo paso no da esa
-- ventana: si el volcado sale mal, el dato de partida ya no esta.
--
-- Lo que se va y donde vive ahora:
--
--   items.total_quantity  ->  SUM(item_stock.quantity), o el recuento de
--                             `item_serials` en un articulo serializado
--                             (migracion 019, `availability.ts`)
--   items.min_stock       ->  item_inventory.min_stock        (021)
--   items.status          ->  item_inventory.physical_status  (021)
--   items.location        ->  item_inventory.location         (021)
--
-- No queda un solo lector en codigo de aplicacion: los repositorios enumeran
-- las columnas del catalogo en vez de `SELECT i.*`, y las pantallas de catalogo
-- dejaron de pedir existencias.
--
-- IRREVERSIBLE. El dato no se pierde —esta en `item_stock` y en
-- `item_inventory` desde la 019 y la 021—, pero estas columnas no vuelven.

-- El indice de la 002 cuelga de `status` y hay que quitarlo primero: PostgreSQL
-- lo borraria en cascada al soltar la columna, pero decirlo aqui deja claro que
-- desaparece a proposito y no como efecto colateral de otra cosa.
DROP INDEX IF EXISTS items_company_status_idx;

ALTER TABLE items DROP COLUMN IF EXISTS total_quantity;
ALTER TABLE items DROP COLUMN IF EXISTS min_stock;
ALTER TABLE items DROP COLUMN IF EXISTS status;
ALTER TABLE items DROP COLUMN IF EXISTS location;
