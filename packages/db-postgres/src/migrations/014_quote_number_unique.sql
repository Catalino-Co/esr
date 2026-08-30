-- Fase 5 — El numero de cotizacion deja de poder repetirse.
--
-- `nextQuoteNumber` lee el maximo y le suma uno. Eso es una carrera: dos
-- emisiones simultaneas leen el mismo maximo y persisten el mismo numero. Y
-- hasta ahora la base no lo frenaba, porque `quotations_company_quote_number_idx`
-- es un indice NORMAL, no unico. Dos cotizaciones con el mismo COT- se
-- guardaban en silencio.
--
-- Copiar una cotizacion multiplica la exposicion: invita al doble clic sobre el
-- mismo registro, que es justo la forma mas facil de provocar la carrera.
--
-- La factura ya nacio con su indice unico y su reintento (migracion 012); esto
-- pone la cotizacion al mismo nivel.

-- ── Antes de nada: si ya hay repetidos, parar y decir cuales ──────────────
--
-- No se renumera automaticamente. Un numero de cotizacion es un documento que
-- el cliente ya vio, asi que elegir un ganador a ciegas no le corresponde a una
-- migracion: lo decide quien opera.
DO $$
DECLARE
	repetidos TEXT;
BEGIN
	SELECT string_agg(DISTINCT quote_number, ', ')
		INTO repetidos
		FROM (
			SELECT company_id, quote_number
			FROM quotations
			WHERE quote_number IS NOT NULL
			GROUP BY company_id, quote_number
			HAVING COUNT(*) > 1
		) duplicadas;

	IF repetidos IS NOT NULL THEN
		RAISE EXCEPTION
			'Hay numeros de cotizacion repetidos y no se puede crear el indice unico: %. Renumerelos antes de aplicar esta migracion.',
			repetidos;
	END IF;
END $$;

DROP INDEX IF EXISTS quotations_company_quote_number_idx;
CREATE UNIQUE INDEX IF NOT EXISTS quotations_company_quote_number_unique
	ON quotations (company_id, quote_number);
