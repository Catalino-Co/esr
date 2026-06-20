const { getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

class SqlitePackageRepository {
  async findById(id) {
    const pkg = await getSingleQuery('SELECT * FROM packages WHERE id = ?', [id]);
    if (!pkg) return null;

    pkg.items = await getQuery(
      `SELECT pi.item_id, pi.quantity, i.name, i.internal_code, i.available_quantity
       FROM package_items pi
       JOIN items i ON pi.item_id = i.id
       WHERE pi.package_id = ?
       ORDER BY i.name ASC`,
      [id]
    );

    return pkg;
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO packages (name, description, suggested_price, notes)
       VALUES (?, ?, ?, ?)`,
      [data.name, data.description || '', data.suggested_price || 0, data.notes || '']
    );

    if (Array.isArray(data.items)) {
      await this.replaceItems(result.id, data.items);
    }

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE packages SET name=?, description=?, suggested_price=?, notes=?
       WHERE id=?`,
      [data.name, data.description || '', data.suggested_price || 0, data.notes || '', id]
    );

    if (Array.isArray(data.items)) {
      await this.replaceItems(id, data.items);
    }

    return await this.findById(id);
  }

  async replaceItems(packageId, items) {
    await runQuery('DELETE FROM package_items WHERE package_id=?', [packageId]);

    for (const item of items) {
      await runQuery(
        'INSERT INTO package_items (package_id, item_id, quantity) VALUES (?, ?, ?)',
        [packageId, item.item_id, item.quantity || 1]
      );
    }
  }

  async setActive(id, isActive) {
    await runQuery('UPDATE packages SET is_active = ? WHERE id = ?', [isActive, id]);
  }
}

module.exports = { SqlitePackageRepository };
