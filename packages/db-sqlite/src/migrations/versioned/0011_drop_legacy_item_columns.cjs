const { getQuery, runQuery } = require('../../connection.cjs');

/**
 * El borrado fisico de las columnas que se mudaron.
 *
 * Va aparte de la 0010 a proposito. Aquella COPIO el minimo, el estado fisico y
 * la ubicacion a `item_inventory` y dejo las originales en su sitio; esta las
 * quita, una vez comprobado que nadie las lee. Partirlo en dos es lo que deja
 * una ventana para mirar, comparar y volver atras: una sola migracion que copia
 * y borra en el mismo paso no la da.
 *
 * NO ES GEMELA EXACTA de `022_drop_legacy_item_columns.sql`, y la diferencia
 * importa:
 *
 *   Cloud borra CUATRO columnas, `total_quantity` incluida, porque alli el
 *   total se calcula (`availability.ts` suma `item_stock`).
 *
 *   ESR Pro borra TRES. `total_quantity` y `available_quantity` se quedan
 *   porque en esta app NO son un espejo del stock: son el MOTOR de reservas.
 *   La disponibilidad se mantiene restandolas al comprometer
 *   —`UPDATE items SET available_quantity = available_quantity - ?`— y de ahi
 *   las leen la conversion a orden, el conduce y la comprobacion de stock.
 *   Sacarlas no seria mover una columna, seria reescribir ese motor.
 *
 * Lo que se va y donde vive ahora:
 *
 *   items.min_stock  ->  item_inventory.min_stock        (0010)
 *   items.status     ->  item_inventory.physical_status  (0010)
 *   items.location   ->  item_inventory.location         (0010)
 *
 * `ALTER TABLE ... DROP COLUMN` pide SQLite 3.35 o superior; el `sqlite3` que
 * empaqueta ESR Pro va por la 3.52. Se comprueba de todas formas antes de
 * intentarlo, porque fallar aqui dejaria la base a medio migrar en una
 * instalacion vieja.
 *
 * IRREVERSIBLE. El dato no se pierde —esta en `item_inventory` desde la 0010—,
 * pero estas columnas no vuelven.
 */
module.exports = {
  version: '0011',
  name: 'drop_legacy_item_columns',
  async up({ columnExists }) {
    const [{ v }] = await getQuery('SELECT sqlite_version() AS v');
    const [mayor, menor] = String(v).split('.').map(Number);
    if (mayor < 3 || (mayor === 3 && menor < 35)) {
      throw new Error(
        `DROP COLUMN necesita SQLite 3.35 o superior y esta instalacion usa la ${v}. ` +
          'Actualice ESR Pro antes de migrar: las columnas viejas son redundantes y ' +
          'dejarlas no rompe nada, pero esta migracion no puede completarse a medias.'
      );
    }

    // `total_quantity` y `available_quantity` NO estan en la lista: ver arriba.
    for (const columna of ['min_stock', 'status', 'location']) {
      if (!(await columnExists('items', columna))) continue;
      await runQuery(`ALTER TABLE items DROP COLUMN "${columna}"`);
    }
  }
};
