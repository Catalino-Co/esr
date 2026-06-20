const { getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteChecklistRepository {
  async findWorkOrderSummary(workOrderId) {
    return await getSingleQuery(
      `SELECT w.*, c.name as client_name
       FROM work_orders w
       LEFT JOIN clients c ON w.client_id = c.id
       WHERE w.id = ?`,
      [workOrderId]
    );
  }

  async findByWorkOrder(workOrderId, type) {
    const workOrderItems = await getQuery(
      `SELECT wi.item_id, wi.quantity as expected_quantity, i.name as item_name, i.internal_code
       FROM work_order_items wi
       JOIN items i ON wi.item_id = i.id
       WHERE wi.work_order_id = ?`,
      [workOrderId]
    );

    const savedItems = await getQuery(
      `SELECT *
       FROM work_order_checklists
       WHERE work_order_id = ? AND type = ?`,
      [workOrderId, type]
    );

    return workOrderItems.map((item) => {
      const saved = savedItems.find((row) => row.item_id === item.item_id);
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        internal_code: item.internal_code,
        expected_quantity: item.expected_quantity,
        actual_quantity: saved ? saved.actual_quantity : 0,
        is_damaged: saved ? saved.is_damaged === 1 : false,
        is_missing: saved ? saved.is_missing === 1 : false,
        notes: saved ? saved.notes : ''
      };
    });
  }

  async replaceForWorkOrder(workOrderId, type, items) {
    await runQuery(
      'DELETE FROM work_order_checklists WHERE work_order_id = ? AND type = ?',
      [workOrderId, type]
    );

    for (const item of items) {
      await runQuery(
        `INSERT INTO work_order_checklists
          (work_order_id, item_id, type, expected_quantity, actual_quantity, is_damaged, is_missing, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workOrderId,
          item.item_id,
          type,
          item.expected_quantity,
          item.actual_quantity,
          item.is_damaged ? 1 : 0,
          item.is_missing ? 1 : 0,
          item.notes || ''
        ]
      );
    }
  }

  async findActiveIncidentKeys(workOrderId) {
    const incidents = await getQuery(
      `SELECT item_id, type
       FROM incidents
       WHERE work_order_id = ? AND is_active = 1`,
      [workOrderId]
    );

    const keys = [];
    for (const incident of incidents) {
      const type = incident.type || '';
      if (type.includes('daño')) keys.push(`${incident.item_id}:daño`);
      if (type.includes('faltante')) keys.push(`${incident.item_id}:faltante`);
    }

    return keys;
  }

  async createAutomaticIncident(input) {
    const result = await runQuery(
      `INSERT INTO incidents
        (type, item_id, client_id, work_order_id, date, description, severity, estimated_cost, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        input.type,
        input.item_id,
        input.client_id,
        input.work_order_id,
        input.date,
        input.description,
        input.severity || 'media',
        input.estimated_cost || 0,
        input.status || 'reportado'
      ]
    );

    return result.id;
  }
}

module.exports = { SqliteChecklistRepository };
