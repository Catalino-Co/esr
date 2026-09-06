const { getQuery, runQuery } = require('../connection.cjs');

class SqliteSerialRepository {
  async findByItem(itemId) {
    return await getQuery(
      'SELECT * FROM item_serials WHERE item_id = ? ORDER BY serial_number ASC',
      [itemId]
    );
  }

  /**
   * Deja la lista de unidades del articulo igual a la que se pasa, RECONCILIANDO
   * en vez de borrar y volver a crear.
   *
   * El DELETE + INSERT de antes reescribia cada unidad en cada guardado, y con
   * ella su almacen y su estado: un serial `entregado` volvia a `disponible` y
   * uno ubicado en un almacen se quedaba sin ninguno solo por abrir la ficha y
   * pulsar Guardar. Aqui lo que ya existe no se toca.
   *
   * `warehouseId` es para los que NACEN en esta llamada; a los que ya estaban no
   * se les mueve de sitio, que es trabajo de Inventario.
   */
  async replaceItemSerials(itemId, serials, warehouseId = null) {
    const existentes = await getQuery(
      'SELECT id, serial_number, status FROM item_serials WHERE item_id = ?',
      [itemId]
    );
    const clave = (valor) => String(valor ?? '').trim().toUpperCase();
    const pedidos = new Map(serials.map((serial) => [clave(serial.serial_number), serial]));
    const porNumero = new Map(existentes.map((fila) => [clave(fila.serial_number), fila]));

    // Lo que ya no esta en la lista se va, salvo que este fuera: una unidad
    // entregada o reservada no se puede borrar desde el catalogo -primero
    // vuelve-, y borrarla dejaria la orden apuntando a algo que no existe.
    for (const fila of existentes) {
      if (pedidos.has(clave(fila.serial_number))) continue;
      if (fila.status && fila.status !== 'disponible') {
        throw new Error(
          `No se puede quitar el serial ${fila.serial_number}: está ${fila.status}.`
        );
      }
      await runQuery('DELETE FROM item_serials WHERE id = ?', [fila.id]);
    }

    for (const serial of serials) {
      if (porNumero.has(clave(serial.serial_number))) continue;
      await runQuery(
        'INSERT INTO item_serials (item_id, serial_number, status, warehouse_id) VALUES (?, ?, ?, ?)',
        [itemId, serial.serial_number, serial.status || 'disponible', warehouseId]
      );
    }
  }

  async findAvailableByItemForWorkOrder(itemId, workOrderId) {
    return await getQuery(
      `SELECT s.id, s.item_id, s.serial_number, s.status,
              CASE WHEN wis.work_order_id = ? THEN 1 ELSE 0 END as assigned_to_current
       FROM item_serials s
       LEFT JOIN work_order_item_serials wis
         ON wis.serial_id = s.id AND wis.work_order_id = ?
       WHERE s.item_id = ?
         AND (s.status = 'disponible' OR wis.work_order_id = ?)
       ORDER BY s.serial_number ASC`,
      [workOrderId || 0, workOrderId || 0, itemId, workOrderId || 0]
    );
  }

  async findAssignmentsByWorkOrder(workOrderId) {
    return await getQuery(
      'SELECT item_id, serial_id FROM work_order_item_serials WHERE work_order_id = ?',
      [workOrderId]
    );
  }

  async assignToWorkOrder(assignments) {
    for (const assignment of assignments) {
      await runQuery(
        'INSERT INTO work_order_item_serials (work_order_id, item_id, serial_id) VALUES (?, ?, ?)',
        [assignment.work_order_id, assignment.item_id, assignment.serial_id]
      );
      await runQuery(
        "UPDATE item_serials SET status = 'reservado' WHERE id = ?",
        [assignment.serial_id]
      );
    }
  }

  async releaseFromWorkOrder(workOrderId) {
    const previousSerials = await getQuery(
      'SELECT serial_id FROM work_order_item_serials WHERE work_order_id = ?',
      [workOrderId]
    );

    for (const serial of previousSerials) {
      await runQuery(
        "UPDATE item_serials SET status = 'disponible' WHERE id = ?",
        [serial.serial_id]
      );
    }

    await runQuery('DELETE FROM work_order_item_serials WHERE work_order_id=?', [workOrderId]);
  }
}

module.exports = { SqliteSerialRepository };
