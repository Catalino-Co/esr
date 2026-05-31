const { getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteRentalRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM work_orders WHERE id = ?', [id]);
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO work_orders
        (client_id, event_id, quotation_id, date, responsible_person, vehicle, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.client_id,
        data.event_id || null,
        data.quotation_id || null,
        data.date || '',
        data.responsible_person || '',
        data.vehicle || '',
        data.notes || '',
        data.status || 'pendiente'
      ]
    );

    await this.replaceItems(result.id, data.items || []);
    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE work_orders SET
        client_id=?, event_id=?, quotation_id=?, date=?,
        responsible_person=?, vehicle=?, notes=?, status=?
       WHERE id=?`,
      [
        data.client_id,
        data.event_id || null,
        data.quotation_id || null,
        data.date || '',
        data.responsible_person || '',
        data.vehicle || '',
        data.notes || '',
        data.status || 'pendiente',
        id
      ]
    );

    return await this.findById(id);
  }

  async listItems(orderId) {
    return await getQuery(
      `SELECT wi.item_id, wi.quantity, i.name, i.internal_code
       FROM work_order_items wi
       JOIN items i ON wi.item_id = i.id
       WHERE wi.work_order_id = ?`,
      [orderId]
    );
  }

  async replaceItems(orderId, items) {
    await runQuery('DELETE FROM work_order_items WHERE work_order_id=?', [orderId]);

    for (const item of items) {
      await runQuery(
        'INSERT INTO work_order_items (work_order_id, item_id, quantity) VALUES (?, ?, ?)',
        [orderId, item.item_id, item.quantity]
      );
    }
  }
}

module.exports = { SqliteRentalRepository };
