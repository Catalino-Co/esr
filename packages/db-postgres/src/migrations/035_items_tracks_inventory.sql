-- Bandera de un articulo de RENTA EXTERNA: la empresa no lo posee, lo renta
-- de un tercero por encargo y no le corresponde almacen ni existencia propia.
-- Default true: todo articulo existente sigue exactamente igual.
ALTER TABLE items ADD COLUMN IF NOT EXISTS tracks_inventory BOOLEAN NOT NULL DEFAULT true;
