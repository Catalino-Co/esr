-- Facturacion independiente: la factura deja de nacer solo de una orden.
--
-- El esquema ya lo permitia -`work_order_id` y `client_id` son NULLABLE desde
-- la 012-. Lo que falta es el tercer origen, la cotizacion, y su ledger: una
-- factura ahora nace de UNA orden, de UNA cotizacion (facturable por partes y
-- mas de una vez), o de ninguna de las dos -factura libre-.

-- ── Origen: cotizacion ────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quotation_id BIGINT REFERENCES quotations(id);
CREATE INDEX IF NOT EXISTS invoices_quotation_idx ON invoices (company_id, quotation_id);

-- ── El impuesto de la factura ─────────────────────────────────────────────
-- `total = subtotal - discount + tax_amount`, la misma identidad que ya usa
-- la cotizacion (migracion 017).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- ── Tasas de linea ────────────────────────────────────────────────────────
-- Mismo tipo y mismo dominio que `quotation_items` (migracion 017): PORCENTAJE,
-- no importe. `invoice_items.total` sigue siendo el BRUTO (cantidad x precio);
-- el descuento y el impuesto se derivan con `calculateQuoteLineAmounts`. Las
-- filas existentes -tasas en 0- siguen imprimiendo exactamente lo mismo.
--
-- Las necesita facturar una cotizacion DIRECTO: hay que reproducir el precio y
-- las tasas que el cliente ya aprobo, no re-cotizar ni inventar un unitario
-- distinto al que vio.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(6, 3) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rate      NUMERIC(6, 3) NOT NULL DEFAULT 0;

-- ── Que linea de cotizacion cubre la factura, y CUANTO ────────────────────
-- Espejo de `invoice_work_order_items` (036) con una diferencia: lleva
-- cantidad. Una cotizacion se factura por partes y mas de una vez, asi que
-- "ya se facturo" no es un si/no por linea sino una SUMA; el indice por tanto
-- NO es unico -al reves que `invoice_conduces`/`invoice_work_order_items`-. La
-- carrera entre dos emisiones simultaneas de la misma cotizacion la frena un
-- `SELECT ... FOR UPDATE` sobre `quotation_items` dentro de la transaccion de
-- creacion, no un indice.
CREATE TABLE IF NOT EXISTS invoice_quotation_items (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
	quotation_item_id BIGINT NOT NULL REFERENCES quotation_items(id),
	quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
	is_active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE invoice_quotation_items DROP CONSTRAINT IF EXISTS invoice_quotation_items_qty_valid;
ALTER TABLE invoice_quotation_items ADD CONSTRAINT invoice_quotation_items_qty_valid
	CHECK (quantity > 0);

CREATE INDEX IF NOT EXISTS invoice_quote_items_line_idx
	ON invoice_quotation_items (quotation_item_id) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS invoice_quote_items_invoice_idx
	ON invoice_quotation_items (company_id, invoice_id);
