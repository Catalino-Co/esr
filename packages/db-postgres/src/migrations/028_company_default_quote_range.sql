-- ── Rango por defecto del listado de cotizaciones ────────────────────────────
--
-- `mes` | `trimestre` | `anio`, siempre el que contiene el dia de hoy. Gemela
-- de `025_company_default_order_range.sql`, para el otro listado que gano el
-- mismo Quick range. Ajuste APARTE: una empresa puede querer una ventana
-- distinta para cotizaciones que para ordenes.
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS default_quote_range TEXT DEFAULT 'mes';
