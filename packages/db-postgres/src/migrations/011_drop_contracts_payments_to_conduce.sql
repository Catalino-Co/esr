-- Fase 9 — Fuera el contrato. El conduce es el documento de dinero.
--
-- El flujo queda en tres documentos: cotizacion -> orden -> conduce. El conduce
-- es lo que en el futuro sera la factura, asi que los pagos y las cuentas por
-- cobrar se mudan ahi.
--
-- Nota sobre el orden: `contracts` nace en la migracion 002, no en la 008 —la
-- 008 solo le anadio indices y CHECKs—. Y la 010 la menciona en su array de
-- tablas con `is_active`, pero eso no rompe nada: la 010 corre ANTES que esta,
-- cuando la tabla todavia existe.

-- ── Los pagos pasan a colgar del conduce ──────────────────────────────────
--
-- No hay backfill posible. Un pago colgaba del contrato o de la cotizacion, y
-- una cotizacion puede tener VARIOS conduces (una por cada entrega parcial y
-- cada devolucion): no hay forma de decidir a cual pertenece. Las filas
-- existentes se descartan.
DELETE FROM payments;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_contract_id_fkey;
DROP INDEX IF EXISTS payments_contract_id_idx;
ALTER TABLE payments DROP COLUMN IF EXISTS contract_id;

-- Tambien se va `quotation_id`. El pago tiene UN solo ancla, el conduce; la
-- cotizacion se alcanza por conduce -> orden -> cotizacion cuando hace falta.
-- El doble anclaje anterior era la causa de que el saldo se calculase en un
-- sitio y se cobrase en otro.
DROP INDEX IF EXISTS payments_quotation_id_idx;
ALTER TABLE payments DROP COLUMN IF EXISTS quotation_id;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS conduce_id BIGINT;
UPDATE payments SET conduce_id = NULL WHERE conduce_id IS NOT NULL;
ALTER TABLE payments ALTER COLUMN conduce_id SET NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_conduce_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_conduce_id_fkey
	FOREIGN KEY (conduce_id) REFERENCES conduces(id);

CREATE INDEX IF NOT EXISTS payments_conduce_id_idx ON payments (company_id, conduce_id);

-- ── Fuera los contratos ───────────────────────────────────────────────────
--
-- `payments.contract_id` era su unica clave foranea entrante, y acaba de
-- soltarse, asi que la tabla cae limpia.
DROP TABLE IF EXISTS contracts;

-- ── El conduce gana estados cerrados ──────────────────────────────────────
--
-- Hasta ahora `conduces.status` no tenia ningun CHECK y la base aceptaba
-- cualquier cadena. `anulado` existia solo como literal de tipo en TypeScript,
-- sin nada detras.
ALTER TABLE conduces DROP CONSTRAINT IF EXISTS conduces_status_valid;
ALTER TABLE conduces ADD CONSTRAINT conduces_status_valid
	CHECK (status IN ('emitido', 'completado', 'anulado'));

-- Quien anulo, cuando y por que. `cancel_mode` distingue el error de emision
-- —que revierte la entrega— de la anulacion comercial, que solo cierra el
-- documento.
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS cancel_mode TEXT;
ALTER TABLE conduces DROP CONSTRAINT IF EXISTS conduces_cancel_mode_valid;
ALTER TABLE conduces ADD CONSTRAINT conduces_cancel_mode_valid
	CHECK (cancel_mode IS NULL OR cancel_mode IN ('comercial', 'error'));

CREATE INDEX IF NOT EXISTS conduces_company_status_idx ON conduces (company_id, status);
