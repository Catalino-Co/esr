-- Fase 9.3 — La factura es un documento propio. El conduce queda aparcado.
--
-- El conduce nacio como nota de ENTREGA y de DEVOLUCION: se emite uno por cada
-- entrega parcial y uno por cada devolucion. Eso lo hace un mal documento de
-- cobro, porque una devolucion no se factura y porque una misma venta puede
-- repartirse en varias entregas.
--
-- Asi que el dinero se muda a `invoices`, que:
--   * cubre UNA O VARIAS entregas de la misma orden (`invoice_conduces`);
--   * nunca cubre una devolucion;
--   * es el unico ancla de un pago.
--
-- El conduce sigue existiendo tal cual, como nota de entrega. Pierde el menu y
-- el estado de cuenta, y queda a la espera de que se retome.

-- ── La factura ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	invoice_number TEXT NOT NULL,
	work_order_id BIGINT REFERENCES work_orders(id),
	client_id BIGINT REFERENCES clients(id),
	date TEXT,
	-- Dos estados y no tres: «cobrada» seria un estado derivado de los pagos y
	-- almacenarlo lo condena a desincronizarse. El saldo se calcula, no se guarda.
	status TEXT NOT NULL DEFAULT 'emitida',
	subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
	discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
	total NUMERIC(12, 2) NOT NULL DEFAULT 0,
	notes TEXT,
	cancelled_at TIMESTAMPTZ,
	cancel_reason TEXT,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ
);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_valid;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_valid
	CHECK (status IN ('emitida', 'anulada'));

-- Mismo dominio de tres valores que el resto de tablas (ver migracion 010).
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_state_valid;
ALTER TABLE invoices ADD CONSTRAINT invoices_state_valid
	CHECK (is_active IN (0, 1, 2));

-- El numero de factura es unico dentro de la empresa. `nextInvoiceNumber` lee el
-- ultimo y suma uno, que es una carrera; este indice es lo que la frena. La
-- cotizacion no lo tiene y por eso puede duplicar numero en silencio.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_unique
	ON invoices (company_id, invoice_number);
CREATE INDEX IF NOT EXISTS invoices_company_state_idx ON invoices (company_id, is_active);
CREATE INDEX IF NOT EXISTS invoices_company_status_idx ON invoices (company_id, status);
CREATE INDEX IF NOT EXISTS invoices_work_order_idx ON invoices (company_id, work_order_id);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (company_id, client_id);

-- ── Las lineas ────────────────────────────────────────────────────────────
--
-- Se COPIAN de los conduces cubiertos en lugar de leerse por join. Una factura
-- emitida no puede cambiar porque alguien corrija el conduce despues.
CREATE TABLE IF NOT EXISTS invoice_items (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
	item_id BIGINT REFERENCES items(id),
	description TEXT,
	quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
	price NUMERIC(12, 2) NOT NULL DEFAULT 0,
	total NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (company_id, invoice_id);

-- ── Que entregas cubre ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_conduces (
	id BIGSERIAL PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id),
	invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
	conduce_id BIGINT NOT NULL REFERENCES conduces(id),
	is_active INTEGER NOT NULL DEFAULT 1
);

-- Una entrega se factura UNA vez... mientras la factura siga viva. Al anularla
-- sus enlaces pasan a 0 y las entregas vuelven a estar disponibles. Por eso el
-- indice es parcial: un UNIQUE a secas dejaria las entregas presas de una
-- factura anulada, y borrar la fila perderia el rastro de que se facturaron.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_conduces_active_unique
	ON invoice_conduces (conduce_id) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS invoice_conduces_invoice_idx ON invoice_conduces (company_id, invoice_id);

-- ── El pago cuelga de la factura ──────────────────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id BIGINT;

-- Backfill real, no borrado: cada conduce de ENTREGA que tenga pagos recibe su
-- factura, con sus mismas lineas y su mismo total. Es un caso que si tiene
-- traduccion, al contrario del contrato -> conduce de la migracion 011.
DO $$
DECLARE
	c RECORD;
	nueva_id BIGINT;
	siguiente INTEGER;
	huerfanos INTEGER;
BEGIN
	FOR c IN
		SELECT DISTINCT co.*
		FROM conduces co
		JOIN payments p ON p.conduce_id = co.id
		WHERE co.conduce_type <> 'devolucion'
		ORDER BY co.id
	LOOP
		SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '\d+')::INTEGER), 0) + 1
			INTO siguiente
			FROM invoices WHERE company_id = c.company_id;

		INSERT INTO invoices
			(company_id, invoice_number, work_order_id, client_id, date, status,
			 subtotal, discount, total, notes, is_active)
		VALUES
			(c.company_id, 'FAC-' || LPAD(siguiente::TEXT, 6, '0'), c.work_order_id,
			 c.client_id, c.date, 'emitida',
			 COALESCE(c.subtotal, 0), COALESCE(c.discount, 0), COALESCE(c.total, 0),
			 c.notes, 1)
		RETURNING id INTO nueva_id;

		INSERT INTO invoice_items (company_id, invoice_id, item_id, description, quantity, price, total)
		SELECT ci.company_id, nueva_id, ci.item_id, i.name,
			COALESCE(ci.quantity, 0), COALESCE(ci.price, 0),
			COALESCE(ci.quantity, 0) * COALESCE(ci.price, 0)
		FROM conduce_items ci
		LEFT JOIN items i ON i.id = ci.item_id AND i.company_id = ci.company_id
		WHERE ci.conduce_id = c.id;

		INSERT INTO invoice_conduces (company_id, invoice_id, conduce_id, is_active)
		VALUES (c.company_id, nueva_id, c.id, 1);

		UPDATE payments SET invoice_id = nueva_id WHERE conduce_id = c.id;
	END LOOP;

	-- Un pago sobre una DEVOLUCION no tiene factura posible: no se factura lo
	-- que vuelve. Se descarta y se deja constancia en el log de la migracion.
	DELETE FROM payments WHERE invoice_id IS NULL;
	GET DIAGNOSTICS huerfanos = ROW_COUNT;
	IF huerfanos > 0 THEN
		RAISE NOTICE 'Se descartaron % pagos sin factura posible (colgaban de una devolucion).', huerfanos;
	END IF;
END $$;

ALTER TABLE payments ALTER COLUMN invoice_id SET NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_invoice_id_fkey
	FOREIGN KEY (invoice_id) REFERENCES invoices(id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments (company_id, invoice_id);

-- Y se suelta el ancla anterior.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_conduce_id_fkey;
DROP INDEX IF EXISTS payments_conduce_id_idx;
ALTER TABLE payments DROP COLUMN IF EXISTS conduce_id;
