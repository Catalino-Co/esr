-- El listado de cotizaciones pasa a filtrar por rango sobre `date`. Sin este
-- indice, cada apertura con rango puesto —que ahora es siempre, por el ajuste
-- de empresa— recorre completa la tabla de cotizaciones de la empresa.
--
-- Sin componente de orden: a diferencia de `work_orders_company_date_idx`, el
-- `ORDER BY` de `list()` sigue siendo `created_at`, no `date`. Este indice es
-- solo para el filtro.
CREATE INDEX IF NOT EXISTS quotations_company_date_idx
	ON quotations (company_id, date);
