const crypto = require('crypto');
const { getSingleQuery, runQuery } = require('./db/index.cjs');

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

function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;

  const parts = String(storedPassword).split('$');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) {
    return String(password) === String(storedPassword);
  }

  const [, iterationsRaw, salt, expectedHash] = parts;
  const iterations = Number(iterationsRaw);
  const actualHash = crypto
    .pbkdf2Sync(String(password), salt, iterations, KEY_LENGTH, DIGEST)
    .toString('hex');

  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function login(username, password) {
  const user = await getSingleQuery(
    'SELECT id, username, password, name, role FROM users WHERE username = ? AND is_active = 1',
    [username]
  );

  if (!user || !verifyPassword(password, user.password)) return null;

  if (!String(user.password).startsWith(`${HASH_PREFIX}$`)) {
    await runQuery('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), user.id]);
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };
}

async function resetAdminUser() {
  const passwordHash = hashPassword('admin123');
  const existing = await getSingleQuery('SELECT id FROM users WHERE username = ?', ['admin']);

  if (existing) {
    await runQuery(
      `UPDATE users
       SET password = ?, name = ?, role = ?, is_active = 1
       WHERE username = ?`,
      [passwordHash, 'Administrador Principal', 'admin', 'admin']
    );
    return;
  }

  await runQuery(
    'INSERT INTO users (username, password, name, role, is_active) VALUES (?, ?, ?, ?, 1)',
    ['admin', passwordHash, 'Administrador Principal', 'admin']
  );
}

async function createUser({ username, password, name, role }) {
  return await runQuery(
    'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
    [username, hashPassword(password), name, role || 'operador']
  );
}

async function updateUser({ id, username, password, name, role }) {
  if (password) {
    return await runQuery(
      'UPDATE users SET username = ?, password = ?, name = ?, role = ? WHERE id = ?',
      [username, hashPassword(password), name, role || 'operador', id]
    );
  }

  return await runQuery(
    'UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?',
    [username, name, role || 'operador', id]
  );
}

module.exports = {
  createUser,
  hashPassword,
  login,
  resetAdminUser,
  updateUser,
  verifyPassword
};
