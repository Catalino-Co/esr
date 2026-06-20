const { getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteIncidentRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM incidents WHERE id = ?', [id]);
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO incidents
        (type, item_id, client_id, work_order_id, date, description, severity, estimated_cost, status, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.type || '',
        data.item_id || null,
        data.client_id || null,
        data.work_order_id || null,
        data.date || new Date().toISOString().split('T')[0],
        data.description || '',
        data.severity || 'media',
        data.estimated_cost || 0,
        data.status || 'reportado',
        data.notes || '',
        data.is_active ?? 1
      ]
    );

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE incidents SET
        type=?, item_id=?, client_id=?, work_order_id=?, date=?,
        description=?, severity=?, estimated_cost=?, status=?, notes=?
       WHERE id=?`,
      [
        data.type || '',
        data.item_id || null,
        data.client_id || null,
        data.work_order_id || null,
        data.date || new Date().toISOString().split('T')[0],
        data.description || '',
        data.severity || 'media',
        data.estimated_cost || 0,
        data.status || 'reportado',
        data.notes || '',
        id
      ]
    );

    return await this.findById(id);
  }

  async updateStatus(id, status) {
    await runQuery('UPDATE incidents SET status = ? WHERE id = ?', [status, id]);
  }

  async setActive(id, isActive) {
    await runQuery('UPDATE incidents SET is_active = ? WHERE id = ?', [isActive, id]);
  }
}

module.exports = { SqliteIncidentRepository };
