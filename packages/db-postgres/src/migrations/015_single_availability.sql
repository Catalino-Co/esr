-- Una sola cuenta de disponibilidad.
--
-- Sobre el mismo articulo convivian TRES numeros distintos, y no coincidian:
--
--   1. `items.available_quantity` — columna guardada, tecleada en la ficha del
--      articulo. Ninguna entrega ni devolucion la actualizaba. Alimentaba el
--      listado de inventario, los reportes, el CSV y la pantalla de paquetes.
--   2. `work_order_stock_reservations` — tabla paralela, escrita al crear la
--      orden y soltada SOLO al cancelarla. Una orden entregada, devuelta y
--      cerrada seguia apartando su mercancia para siempre. Alimentaba la ficha
--      del articulo.
--   3. La derivacion sobre `work_order_items` filtrando por estado de la orden
--      — la unica que bloqueaba de verdad al crear una orden, y por tanto la
--      unica obligada a ser correcta.
--
-- En la base de demo, sobre un articulo del que existen 5 unidades: la tabla
-- decia 7 comprometidas, la columna 4 disponibles, y la derivacion 4
-- comprometidas.
--
-- Se queda la 3. Las otras dos desaparecen.
--
-- Lo importante: la liberacion deja de ser un paso que alguien tiene que
-- acordarse de escribir en cada operacion nueva. Una orden que llega a
-- `devuelto` o `cerrado` sale de la lista de estados vivos y deja de contar
-- sola. No hay nada que soltar porque no hay nada apartado.

-- ── Fuera la tabla paralela ───────────────────────────────────────────────
--
-- No tiene ninguna clave foranea entrante: nadie apunta a ella. Todo lo que
-- guardaba —articulo, cantidad, fechas, estado— se deriva de
-- `work_order_items` mas `work_orders`, que es lo que hace la consulta que se
-- queda.
DROP TABLE IF EXISTS work_order_stock_reservations;

-- ── Fuera la columna guardada ─────────────────────────────────────────────
--
-- `available_quantity` pasa a calcularse en cada consulta como
-- `total - comprometido`. Dejarla existiendo sin que nadie la lea seria peor
-- que borrarla: la siguiente persona la encontraria y la creeria.
ALTER TABLE items DROP COLUMN IF EXISTS available_quantity;
