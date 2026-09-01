const crypto = require('crypto');
const { getSingleQuery, runQuery, withTransaction } = require('./db/index.cjs');

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

/**
 * Primer arranque: la aplicacion no traia ningun usuario.
 *
 * El esquema inicial solo inserta `company_info` y el seed no toca `users`, asi
 * que una instalacion nueva se quedaba con la tabla vacia y la pantalla de
 * acceso era infranqueable. En lugar de sembrar un `admin/admin123` —una
 * credencial conocida, permanente, en una aplicacion con datos de facturacion—
 * la pantalla de acceso detecta que no hay nadie y pide crear el administrador.
 *
 * Aqui vivia `resetAdminUser()`, que hacia UPDATE incondicional: llamarla en
 * cada arranque habria pisado la contraseña de toda instalacion existente. Se
 * retiro junto con esta nota para que no se reviva por descuido.
 */
async function needsBootstrap() {
  const fila = await getSingleQuery('SELECT COUNT(*) AS total FROM users');
  return Number(fila?.total || 0) === 0;
}

const MIN_PASSWORD = 8;

async function bootstrapAdmin({ username, password, name } = {}) {
  const usuario = String(username || '').trim();
  const clave = String(password || '');

  if (!usuario) throw new Error('Indique el nombre de usuario.');
  if (clave.length < MIN_PASSWORD) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }
  if (clave.toLowerCase() === usuario.toLowerCase()) {
    throw new Error('La contraseña no puede ser igual al usuario.');
  }

  return await withTransaction(async () => {
    // Se vuelve a contar DENTRO de la transaccion. Sin esto, dos ventanas
    // abiertas a la vez podrian crear dos administradores; con el UNIQUE de
    // `username` la segunda fallaria, pero con un mensaje ininteligible. Y es
    // ademas lo que impide que este canal se use mas tarde para colar un admin.
    const fila = await getSingleQuery('SELECT COUNT(*) AS total FROM users');
    if (Number(fila?.total || 0) > 0) {
      throw new Error('Ya existe un usuario. Use el inicio de sesión.');
    }

    await runQuery(
      'INSERT INTO users (username, password, name, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [usuario, hashPassword(clave), String(name || '').trim() || usuario, 'admin']
    );

    return { username: usuario };
  });
}

/**
 * Rol por defecto `staff`, no `operador`.
 *
 * Desde la migracion 0013 los roles son los de `@esr/core`, los mismos que
 * Cloud: admin, manager, staff, viewer. El arranque inicial sigue creando
 * `admin`, que es correcto: el primer usuario tiene que poder administrar.
 */
async function createUser({ username, password, name, role }) {
  return await runQuery(
    'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
    [username, hashPassword(password), name, role || 'staff']
  );
}

async function updateUser({ id, username, password, name, role }) {
  if (password) {
    return await runQuery(
      'UPDATE users SET username = ?, password = ?, name = ?, role = ? WHERE id = ?',
      [username, hashPassword(password), name, role || 'staff', id]
    );
  }

  return await runQuery(
    'UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?',
    [username, name, role || 'staff', id]
  );
}

module.exports = {
  bootstrapAdmin,
  createUser,
  hashPassword,
  login,
  needsBootstrap,
  updateUser,
  verifyPassword
};
