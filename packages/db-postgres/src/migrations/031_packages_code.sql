-- Codigo de 4 digitos por paquete, empezando en 1001.
--
-- Por EMPRESA: cada inquilino numera el suyo desde 1001, igual que
-- quote_number/invoice_number son unicos por (company_id, numero) y no
-- globales.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS code TEXT;

WITH numeradas AS (
	SELECT id, 1000 + ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id) AS n
	FROM packages WHERE code IS NULL
)
UPDATE packages p SET code = numeradas.n::text
FROM numeradas WHERE p.id = numeradas.id;

CREATE UNIQUE INDEX IF NOT EXISTS packages_company_code_unique ON packages (company_id, code);
