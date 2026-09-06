/**
 * Los seriales sin almacen, al principal. Gemela de la 032 de Postgres.
 *
 * La 0009 puso en 'PRIN' los seriales que existian entonces, pero el alta de
 * seriales nunca escribio `warehouse_id`: todo el que se dio de alta despues
 * quedo en NULL. Y como Inventario cuenta las unidades de un almacen con
 * `s.warehouse_id = ?`, esas unidades no se contaban en NINGUNO —salian en cero
 * en todos los almacenes— mientras el total del articulo si las veia.
 *
 * Se reparan aqui y se cierra la fuente en el mismo cambio: el alta de seriales
 * pasa a pedir el almacen. La columna se queda NULLABLE a proposito: sin
 * almacenes creados no se podria dar de alta ni una unidad si fuera NOT NULL.
 */
module.exports = {
  version: '0020',
  name: 'serial_warehouse_backfill',
  async up({ getQuery, runQuery }) {
    const principal = await getQuery(
      `SELECT id FROM warehouses WHERE is_active = 1
        ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, name
        LIMIT 1`
    );
    if (!principal.length) return;

    await runQuery('UPDATE item_serials SET warehouse_id = ? WHERE warehouse_id IS NULL', [
      principal[0].id
    ]);
  }
};
