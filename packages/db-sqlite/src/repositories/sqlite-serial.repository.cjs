const { getQuery, runQuery } = require('../connection.cjs');

class SqliteSerialRepository {
  async findByItem(itemId) {
    return await getQuery(
      'SELECT * FROM item_serials WHERE item_id = ? ORDER BY serial_number ASC',
      [itemId]
    );
  }

  async replaceItemSerials(itemId, serials) {
    await runQuery('DELETE FROM item_serials WHERE item_id = ?', [itemId]);

    for (const serial of serials) {
      await runQuery(
        'INSERT INTO item_serials (item_id, serial_number, status) VALUES (?, ?, ?)',
        [itemId, serial.serial_number, serial.status || 'disponible']
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
