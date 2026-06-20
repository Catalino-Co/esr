const { getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteConduceRepository {
  async findById(id) {
    const conduce = await getSingleQuery('SELECT * FROM conduces WHERE id = ?', [id]);
    if (!conduce) return null;

    conduce.items = await getQuery(
      `SELECT ci.item_id, ci.quantity, ci.price, (ci.quantity * ci.price) as total,
              i.name, i.internal_code
       FROM conduce_items ci
       LEFT JOIN items i ON ci.item_id = i.id
       WHERE ci.conduce_id = ?
       ORDER BY ci.id ASC`,
      [id]
    );

    return conduce;
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO conduces
        (work_order_id, client_id, date, status, driver_or_vehicle, notes, subtotal, discount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.work_order_id || null,
        data.client_id || null,
        data.date || new Date().toISOString().split('T')[0],
        data.status || 'emitido',
        data.driver_or_vehicle || '',
        data.notes || '',
        data.subtotal || 0,
        data.discount || 0,
        data.total || 0
      ]
    );

    if (Array.isArray(data.items)) {
      await this.replaceItems(result.id, data.items);
    }

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE conduces SET
        work_order_id=?, client_id=?, date=?, status=?, driver_or_vehicle=?, notes=?,
        subtotal=?, discount=?, total=?
       WHERE id=?`,
      [
        data.work_order_id || null,
        data.client_id || null,
        data.date || new Date().toISOString().split('T')[0],
        data.status || 'emitido',
        data.driver_or_vehicle || '',
        data.notes || '',
        data.subtotal || 0,
        data.discount || 0,
        data.total || 0,
        id
      ]
    );

    if (Array.isArray(data.items)) {
      await this.replaceItems(id, data.items);
    }

    return await this.findById(id);
  }

  async replaceItems(conduceId, items) {
    await runQuery('DELETE FROM conduce_items WHERE conduce_id=?', [conduceId]);

    for (const item of items) {
      await runQuery(
        `INSERT INTO conduce_items (conduce_id, item_id, quantity, price)
         VALUES (?, ?, ?, ?)`,
        [conduceId, item.item_id, item.quantity || 0, item.price || 0]
      );
    }
  }

  async updateStatus(id, status) {
    await runQuery('UPDATE conduces SET status = ? WHERE id = ?', [status, id]);
  }

  async setActive(id, isActive) {
    await runQuery('UPDATE conduces SET is_active = ? WHERE id = ?', [isActive, id]);
  }
}

module.exports = { SqliteConduceRepository };
