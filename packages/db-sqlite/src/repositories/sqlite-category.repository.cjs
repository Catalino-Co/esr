const { getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteCategoryRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM categories WHERE id = ?', [id]);
  }

  async create(data) {
    const result = await runQuery(
      'INSERT INTO categories (name, color) VALUES (?, ?)',
      [data.name, data.color || '#6366f1']
    );

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      'UPDATE categories SET name = ?, color = ? WHERE id = ?',
      [data.name, data.color || '#6366f1', id]
    );

    return await this.findById(id);
  }

  async setActive(id, isActive) {
    await runQuery('UPDATE subcategories SET is_active = ? WHERE category_id = ?', [isActive, id]);
    await runQuery('UPDATE categories SET is_active = ? WHERE id = ?', [isActive, id]);
  }
}

class SqliteSubcategoryRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM subcategories WHERE id = ?', [id]);
  }

  async create(data) {
    const result = await runQuery(
      'INSERT INTO subcategories (category_id, name) VALUES (?, ?)',
      [data.category_id, data.name]
    );

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      'UPDATE subcategories SET category_id = ?, name = ? WHERE id = ?',
      [data.category_id, data.name, id]
    );

    return await this.findById(id);
  }

  async setActive(id, isActive) {
    await runQuery('UPDATE subcategories SET is_active = ? WHERE id = ?', [isActive, id]);
  }
}

module.exports = { SqliteCategoryRepository, SqliteSubcategoryRepository };
