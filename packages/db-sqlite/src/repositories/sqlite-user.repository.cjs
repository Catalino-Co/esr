const crypto = require('crypto');
const { getSingleQuery, runQuery } = require('../connection.cjs');

const HASH_PREFIX = 'pbkdf2_sha256';
const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex');

  return `${HASH_PREFIX}$${ITERATIONS}$${salt}$${hash}`;
}

class SqliteUserRepository {
  async findById(id) {
    return await getSingleQuery(
      'SELECT id, username, name, role, is_active FROM users WHERE id = ?',
      [id]
    );
  }

  async findByUsername(username) {
    return await getSingleQuery(
      'SELECT id, username, password, name, role, is_active FROM users WHERE username = ?',
      [username]
    );
  }

  async create(data) {
    const result = await runQuery(
      'INSERT INTO users (username, password, name, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [
        data.username,
        hashPassword(data.password || ''),
        data.name,
        data.role || 'operador',
        data.is_active ?? 1
      ]
    );

    return await this.findById(result.id);
  }

  async update(id, data) {
    if (data.password) {
      await runQuery(
        'UPDATE users SET username = ?, password = ?, name = ?, role = ? WHERE id = ?',
        [data.username, hashPassword(data.password), data.name, data.role || 'operador', id]
      );
    } else {
      await runQuery(
        'UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?',
        [data.username, data.name, data.role || 'operador', id]
      );
    }

    return await this.findById(id);
  }

  async setActive(id, isActive) {
    await runQuery('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
  }
}

module.exports = { SqliteUserRepository, hashPassword };
