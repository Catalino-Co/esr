-- Estado de circulacion de tres valores, alineado con ESR Pro Desktop.
--
--   1 = Activo     2 = Inactivo (pausa reversible)     0 = Archivado (retirado)
--
-- Cloud venia usando `is_active` como booleano, donde 0 significaba "el usuario
-- pulso Desactivar". Eso equivale a INACTIVO, no a archivado: se migra a 2 para
-- preservar la intencion y dejar el 0 libre con su nuevo significado.
--
-- Desktop ya usa esta convencion en doce pantallas; adoptarla evita que la
-- misma columna signifique cosas distintas en cada app del monorepo.

DO $$
DECLARE
	t TEXT;
	tables TEXT[] := ARRAY[
		'clients', 'event_types', 'categories', 'subcategories', 'events',
		'items', 'packages', 'quotations', 'work_orders', 'conduces',
		'incidents', 'collaborators', 'suppliers', 'contracts'
	];
BEGIN
	FOREACH t IN ARRAY tables LOOP
		-- Reinterpretar los desactivados como inactivos.
		EXECUTE format('UPDATE %I SET is_active = 2 WHERE is_active = 0', t);

		-- Cerrar el dominio: hasta ahora la base aceptaba cualquier entero.
		EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_state_valid');
		EXECUTE format(
			'ALTER TABLE %I ADD CONSTRAINT %I CHECK (is_active IN (0, 1, 2))',
			t, t || '_state_valid'
		);

		-- Los listados filtran siempre por empresa + estado.
		EXECUTE format(
			'CREATE INDEX IF NOT EXISTS %I ON %I (company_id, is_active)',
			t || '_company_state_idx', t
		);
	END LOOP;
END $$;

-- `contracts` tenia un indice parcial que asumia is_active = 1 como "vigente".
-- Sigue siendo correcto con el modelo nuevo (solo los activos cuentan), pero se
-- recrea para dejar explicito que ahora 1 es un valor de tres y no un booleano.
DROP INDEX IF EXISTS contracts_company_quotation_unique;
CREATE UNIQUE INDEX contracts_company_quotation_unique
	ON contracts (company_id, quotation_id)
	WHERE quotation_id IS NOT NULL AND is_active = 1 AND status <> 'cancelado';
