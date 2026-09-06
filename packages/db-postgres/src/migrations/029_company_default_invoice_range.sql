-- ── Rango por defecto del listado de facturas ────────────────────────────────
--
-- `mes` | `trimestre` | `anio`, siempre el que contiene el dia de hoy. Gemela
-- de `025_company_default_order_range.sql` y `028_company_default_quote_range.sql`,
-- para el tercer listado que gana el mismo Quick range. Ajuste APARTE: una
-- empresa puede querer una ventana distinta para facturas.
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS default_invoice_range TEXT DEFAULT 'mes';
