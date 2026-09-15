/**
 * Bandera de un articulo de RENTA EXTERNA: la empresa no lo posee, lo renta
 * de un tercero por encargo y no le corresponde almacen ni existencia propia.
 * Default 1: todo articulo existente sigue exactamente igual.
 */
module.exports = {
  version: '0023',
  name: 'items_tracks_inventory',
  async up({ addColumnIfMissing }) {
    await addColumnIfMissing('items', 'tracks_inventory', 'INTEGER NOT NULL DEFAULT 1');
  }
};
