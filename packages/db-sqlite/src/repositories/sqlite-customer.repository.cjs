const { getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteCustomerRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM clients WHERE id = ?', [id]);
  }

  async create(data) {
    const result = await runQuery(
      `INSERT INTO clients (name, document_id, phone, email, address, contact_person, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.document_id || '',
        data.phone || '',
        data.email || '',
        data.address || '',
        data.contact_person || '',
        data.notes || ''
      ]
    );

    return await this.findById(result.id);
  }

  async update(id, data) {
    await runQuery(
      `UPDATE clients
       SET name = ?, document_id = ?, phone = ?, email = ?, address = ?, contact_person = ?, notes = ?
       WHERE id = ?`,
      [
        data.name,
        data.document_id || '',
        data.phone || '',
        data.email || '',
        data.address || '',
        data.contact_person || '',
        data.notes || '',
        id
      ]
    );

    return await this.findById(id);
  }
}

module.exports = { SqliteCustomerRepository };
