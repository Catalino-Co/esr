-- Las ordenes de trabajo, consultables por evento.
--
-- La ficha del evento estrena dos tarjetas de resumen —cotizacion y orden— y la
-- de la orden necesita `WHERE company_id = $1 AND event_id = $2`. Sin indice eso
-- es un recorrido completo de `work_orders` en CADA apertura de un evento.
--
-- El gemelo para cotizaciones ya existe desde la migracion 004
-- (`quotations_company_event_id_idx`); esto solo pone las ordenes al mismo
-- nivel. Es la unica asimetria que quedaba entre las dos tablas hermanas.
--
-- Solo un indice: ni una columna nueva, ni un dato tocado.
CREATE INDEX IF NOT EXISTS work_orders_company_event_id_idx
	ON work_orders (company_id, event_id);
