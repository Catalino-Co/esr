-- El listado de ordenes pasa a abrir SIEMPRE con una ventana de fechas puesta:
-- filtra por rango sobre `date` y ordena por `date DESC, id DESC`. Sin este
-- indice, cada apertura es un recorrido completo de las `work_orders` de la
-- empresa, que es justo lo que la ventana viene a evitar.
--
-- Gemelo del que ya existe para `(company_id, event_id)` en la migracion 023.
CREATE INDEX IF NOT EXISTS work_orders_company_date_idx
	ON work_orders (company_id, date DESC, id DESC);
