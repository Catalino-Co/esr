-- ── Rango por defecto del listado de eventos ─────────────────────────────────
--
-- `mes` | `trimestre` | `anio`, siempre el que contiene el dia de hoy. Gemela
-- de `025_company_default_order_range.sql`, `028_company_default_quote_range.sql`
-- y `029_company_default_invoice_range.sql`, para el cuarto listado que gana
-- el mismo Quick range. Ajuste APARTE: una empresa puede querer una ventana
-- distinta para eventos.
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS default_event_range TEXT DEFAULT 'mes';
