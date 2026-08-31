-- `stock_movements.user_id` es BIGINT, no UUID.
--
-- La migracion 019 lo declaro UUID por analogia con `company_id`, que si lo es.
-- Pero en este esquema el UUID es de las EMPRESAS: `users.id` es BIGSERIAL desde
-- la 001. El error no aparecio al migrar —la columna se creo tan tranquila— sino
-- la primera vez que algo intento escribir en ella:
--
--   invalid input syntax for type uuid: "1"
--
-- Una columna con el tipo equivocado y sin filas no da señales de vida hasta que
-- llega el primer INSERT. De ahi que se cambie ahora y no antes.
--
-- El cambio es seguro porque la columna esta VACIA: nada llego a escribirse en
-- ella, justamente porque el tipo estaba mal. `USING NULL` lo deja explicito en
-- vez de confiar en que un cast de uuid a bigint no exista.
ALTER TABLE stock_movements
	ALTER COLUMN user_id TYPE BIGINT USING NULL;

-- La referencia que la 019 no puso: el responsable de un movimiento es un
-- usuario de verdad. `ON DELETE SET NULL` y no `CASCADE`: si un usuario se borra,
-- el movimiento no desaparece —el historial es lo que no se toca— y se queda sin
-- responsable, que es lo mismo que ya pasa con los movimientos anteriores a esta
-- reforma.
ALTER TABLE stock_movements
	DROP CONSTRAINT IF EXISTS stock_movements_user_id_fkey;

ALTER TABLE stock_movements
	ADD CONSTRAINT stock_movements_user_id_fkey
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
