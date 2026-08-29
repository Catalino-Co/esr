-- Fase 8c — Contratos y pagos.
--
-- Las tablas ya existian desde la migracion 002 pero nunca se usaron: no
-- tenian indices ni restricciones. Aqui se preparan para uso real.

-- El numero de contrato es unico DENTRO de la empresa, igual que COT-/ORD-.
-- Se permite NULL para los contratos en borrador que aun no lo tienen.
CREATE UNIQUE INDEX IF NOT EXISTS contracts_company_number_unique
	ON contracts (company_id, number)
	WHERE number IS NOT NULL;

-- Una cotizacion tiene como mucho un contrato vigente. Los cancelados no
-- cuentan, para poder rehacer un contrato que se anulo por error.
CREATE UNIQUE INDEX IF NOT EXISTS contracts_company_quotation_unique
	ON contracts (company_id, quotation_id)
	WHERE quotation_id IS NOT NULL AND is_active = 1 AND status <> 'cancelado';

CREATE INDEX IF NOT EXISTS contracts_company_id_idx ON contracts (company_id);
CREATE INDEX IF NOT EXISTS contracts_company_status_idx ON contracts (company_id, status);
CREATE INDEX IF NOT EXISTS contracts_client_id_idx ON contracts (company_id, client_id);

-- Los pagos se consultan casi siempre por su contrato o su cotizacion.
CREATE INDEX IF NOT EXISTS payments_company_id_idx ON payments (company_id);
CREATE INDEX IF NOT EXISTS payments_contract_id_idx ON payments (company_id, contract_id);
CREATE INDEX IF NOT EXISTS payments_quotation_id_idx ON payments (company_id, quotation_id);
CREATE INDEX IF NOT EXISTS payments_client_id_idx ON payments (company_id, client_id);

-- Un importe negativo o cero nunca es un pago valido. La aplicacion ya lo
-- valida, pero la barrera real tiene que estar en la base.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);

-- Estados cerrados, como en el resto del modelo.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_valid;
ALTER TABLE payments ADD CONSTRAINT payments_status_valid
	CHECK (status IN ('pendiente', 'pagado', 'anulado'));

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_valid;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_valid
	CHECK (status IN ('borrador', 'firmado', 'cancelado'));

-- `payments` no tenia marca de actualizacion; se necesita para saber cuando se
-- anulo un pago sin tener que cruzar con audit_logs.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
