-- Borrador: la factura nace editable, no emitida en el mismo golpe.
--
-- Antes de esta migracion CUALQUIER factura nacia 'emitida': la unica forma
-- de corregir una linea equivocada era anularla entera y volver a empezar.
-- Ahora nace 'borrador' -editable, todavia no el documento final- y una
-- accion aparte ("Finalizar factura") la deja 'emitida', que sigue siendo
-- el unico estado que admite cobros. Anularla (a 'anulada') funciona igual
-- desde cualquiera de los dos: es como se descarta un borrador que ya no
-- se quiere, sin inventar un concepto nuevo de "descartar".

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_valid;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_valid
	CHECK (status IN ('borrador', 'emitida', 'anulada'));

-- Belt-and-suspenders: `insertHeader()` siempre nombra `status` de forma
-- explicita y nunca depende de este DEFAULT, pero se cambia igual para que
-- un INSERT manual -consola, script de datos- nazca borrador por accidente
-- y no emitida.
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'borrador';
