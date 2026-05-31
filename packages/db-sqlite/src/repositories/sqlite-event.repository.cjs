const { getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteEventRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM events WHERE id = ?', [id]);
  }

  async findConflictingByDate(input) {
    const clauses = ['date = ?'];
    const params = [input.date];

    if (input.exclude_event_id) {
      clauses.push('id != ?');
      params.push(input.exclude_event_id);
    }

    if (input.client_id) {
      clauses.push('client_id = ?');
      params.push(input.client_id);
    }

    if (input.location) {
      clauses.push('location = ?');
      params.push(input.location);
    }

    return await getQuery(`SELECT * FROM events WHERE ${clauses.join(' AND ')}`, params);
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO events
        (client_id, name, event_type, date, departure_time, setup_time, pickup_date, pickup_time,
         location, responsible_person, notes, quotation_id, work_order_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.client_id,
        data.name,
        data.event_type || '',
        data.date || '',
        data.departure_time || '',
        data.setup_time || '',
        data.pickup_date || '',
        data.pickup_time || '',
        data.location || '',
        data.responsible_person || '',
        data.notes || '',
        data.quotation_id || null,
        data.work_order_id || null,
        data.status || 'confirmado'
      ]
    );

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE events SET
        client_id=?, name=?, event_type=?, date=?, departure_time=?, setup_time=?,
        pickup_date=?, pickup_time=?, location=?, responsible_person=?, notes=?,
        quotation_id=?, work_order_id=?, status=?
       WHERE id=?`,
      [
        data.client_id,
        data.name,
        data.event_type || '',
        data.date || '',
        data.departure_time || '',
        data.setup_time || '',
        data.pickup_date || '',
        data.pickup_time || '',
        data.location || '',
        data.responsible_person || '',
        data.notes || '',
        data.quotation_id || null,
        data.work_order_id || null,
        data.status || 'confirmado',
        id
      ]
    );

    return await this.findById(id);
  }
}

module.exports = { SqliteEventRepository };
