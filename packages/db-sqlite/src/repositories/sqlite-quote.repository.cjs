const { getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteQuoteRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM quotations WHERE id = ?', [id]);
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO quotations
        (client_id, event_id, date, validity_days, subtotal, discount, total, status, notes, conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.client_id,
        data.event_id || null,
        data.date || '',
        data.validity_days || 15,
        data.subtotal || 0,
        data.discount || 0,
        data.total || 0,
        data.status || 'borrador',
        data.notes || '',
        data.conditions || ''
      ]
    );

    await this.replaceItems(result.id, data.items || []);
    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE quotations SET
        client_id=?, event_id=?, date=?, validity_days=?,
        subtotal=?, discount=?, total=?, status=?, notes=?, conditions=?
       WHERE id=?`,
      [
        data.client_id,
        data.event_id || null,
        data.date || '',
        data.validity_days || 15,
        data.subtotal || 0,
        data.discount || 0,
        data.total || 0,
        data.status || 'borrador',
        data.notes || '',
        data.conditions || '',
        id
      ]
    );

    return await this.findById(id);
  }

  async replaceItems(quoteId, items) {
    await runQuery('DELETE FROM quotation_items WHERE quotation_id=?', [quoteId]);

    for (const item of items) {
      if (item.is_package) {
        await runQuery(
          'INSERT INTO quotation_items (quotation_id, package_id, quantity, price) VALUES (?,?,?,?)',
          [quoteId, item.id, item.quantity, item.price]
        );
      } else {
        await runQuery(
          'INSERT INTO quotation_items (quotation_id, item_id, quantity, price) VALUES (?,?,?,?)',
          [quoteId, item.id, item.quantity, item.price]
        );
      }
    }
  }
}

module.exports = { SqliteQuoteRepository };
