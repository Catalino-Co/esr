const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sqlite = require('../src/index.cjs');
const migracion = require('../src/migrations/versioned/0010_item_inventory.cjs');

/** Los mismos ayudantes que el runner pasa a cada migracion. */
const helpers = {
	getQuery: sqlite.getQuery,
	runQuery: sqlite.runQuery,
	async columnExists(tabla, columna) {
		const filas = await sqlite.getQuery(`PRAGMA table_info(${tabla})`);
		return filas.some((f) => f.name === columna);
	},
	async addColumnIfMissing(tabla, columna, definicion) {
		if (await helpers.columnExists(tabla, columna)) return;
		await sqlite.runQuery(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
	}
};

/**
 * La migracion 0010 —minimo, estado fisico y ubicacion salen de `items`—.
 *
 * Lo que se demuestra es que es NEUTRA: copia lo que ya decia cada ficha y no
 * inventa ni pierde nada. Es la propiedad que no se ve en pantalla, porque una
 * pantalla que lee la tabla nueva enseña lo que haya en ella, este bien o mal.
 *
 * Se cubren los tres casos que se comportan distinto en el volcado:
 *   - ficha COMPLETA        -> se copia tal cual
 *   - `status` vacio o NULL -> cae en «disponible», no en cadena vacia
 *   - `min_stock` NULL      -> cae en 0, no en NULL
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-inventario-'));

/** Lo que la ficha de cada articulo decia ANTES de 0010. */
let antes;

test('se siembra una base con las tres formas de ficha', async () => {
	sqlite.connectSqliteDatabase({ dbPath: path.join(dir, 'prueba.sqlite') });
	await sqlite.initDatabase();

	await sqlite.runQuery(
		`INSERT INTO items (internal_code, name, item_type, total_quantity, min_stock, status, location, is_active)
		 VALUES ('A-1', 'Silla', 'cantidad', 200, 25, 'mantenimiento', 'Pasillo 3', 1)`
	);
	await sqlite.runQuery(
		`INSERT INTO items (internal_code, name, item_type, total_quantity, min_stock, status, location, is_active)
		 VALUES ('A-2', 'Mesa', 'cantidad', 40, 0, '', NULL, 1)`
	);
	await sqlite.runQuery(
		`INSERT INTO items (internal_code, name, item_type, total_quantity, min_stock, status, location, is_active)
		 VALUES ('A-3', 'Consola', 'serializado', 0, NULL, NULL, NULL, 1)`
	);

	antes = await sqlite.getQuery(
		'SELECT id, internal_code, min_stock, status, location FROM items ORDER BY id'
	);
	assert.equal(antes.length, 3);
});

test('0010 esta registrada y crea la tabla y las dos columnas', async () => {
	assert.ok(
		typeof migracion.up === 'function' && migracion.version === '0010',
		'la migracion debe exportar `up` y su version'
	);

	const versiones = await sqlite.getQuery('SELECT version FROM schema_migrations');
	assert.ok(
		versiones.some((v) => v.version === '0010'),
		'0010 debe estar en el array MIGRATIONS del runner: si se olvida, no falla nada, simplemente no se ejecuta nunca'
	);

	const mov = await sqlite.getQuery('PRAGMA table_info(stock_movements)');
	assert.ok(mov.some((c) => c.name === 'unit_cost'), 'falta stock_movements.unit_cost');

	const info = await sqlite.getQuery('PRAGMA table_info(company_info)');
	assert.ok(
		info.some((c) => c.name === 'default_valuation_rule'),
		'falta company_info.default_valuation_rule'
	);
});

test('el volcado es NEUTRO: la ficha de cada articulo se copia tal cual', async () => {
	// Se vuelve a ejecutar para volcar los articulos sembrados despues de
	// migrar. Es idempotente —`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`,
	// `addColumnIfMissing`— y volver a pasarla es justo lo que lo demuestra.
	await migracion.up(helpers);

	const filas = await sqlite.getQuery(
		'SELECT item_id, min_stock, physical_status, location FROM item_inventory ORDER BY item_id'
	);
	assert.equal(filas.length, antes.length, 'una fila por articulo, ni una mas');

	for (const [i, fila] of filas.entries()) {
		const ficha = antes[i];
		assert.equal(fila.item_id, ficha.id);
		// `min_stock` NULL cae en 0, no arrastra el NULL.
		assert.equal(fila.min_stock, ficha.min_stock ?? 0, `minimo de ${ficha.internal_code}`);
		// `status` vacio o NULL cae en «disponible»: una condicion fisica en
		// blanco no es un estado, es un hueco.
		assert.equal(
			fila.physical_status,
			ficha.status || 'disponible',
			`estado fisico de ${ficha.internal_code}`
		);
		assert.equal(fila.location ?? null, ficha.location ?? null);
	}
});

test('las columnas viejas de `items` siguen intactas', async () => {
	// No se borran en esta migracion: dejan de leerse y de escribirse, y el
	// borrado va aparte, una vez verificado. Una migracion que destruye el dato
	// de partida no tiene vuelta.
	const despues = await sqlite.getQuery(
		'SELECT id, min_stock, status, location FROM items ORDER BY id'
	);
	assert.deepEqual(despues, antes.map((f) => ({
		id: f.id,
		min_stock: f.min_stock,
		status: f.status,
		location: f.location
	})));
});

test.after(async () => {
	await sqlite.closeSqliteDatabase();
	fs.rmSync(dir, { recursive: true, force: true });
});
