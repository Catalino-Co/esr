const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sqlite = require('../src/index.cjs');
const migracion = require('../src/migrations/versioned/0009_warehouses_and_stock.cjs');

/**
 * Los mismos ayudantes que el runner pasa a cada migracion. El runner no los
 * exporta, asi que se reconstruyen aqui con el MISMO comportamiento: son cuatro
 * lineas y duplicar el runner entero para probar una migracion seria peor.
 */
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
	},
	async createIndexIfMissing(nombre, sql) {
		const filas = await sqlite.getQuery(
			"SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
			[nombre]
		);
		if (!filas.length) await sqlite.runQuery(sql);
	}
};

/**
 * La migracion 0009 —almacenes, unidades y existencias por almacen— sobre una
 * base migrada desde cero.
 *
 * Lo que se demuestra es que es NEUTRA: reparte lo que ya habia y no mueve el
 * total de ningun articulo. Es la unica propiedad que no se puede comprobar
 * mirando la pantalla, y la que rompe 29 archivos de golpe si sale mal.
 *
 * Se cubren las DOS ramas del modelo, que se comportan distinto:
 *   - articulo DE CANTIDAD  -> su existencia se vuelca a `item_stock`
 *   - articulo SERIALIZADO  -> no lleva fila; lo que se reparte son sus seriales
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-almacenes-'));

/** Lo que la base tenia ANTES de 0009, medido con el modelo viejo. */
let antes;

test('se siembra una base con las dos clases de articulo', async () => {
	sqlite.connectSqliteDatabase({ dbPath: path.join(dir, 'prueba.sqlite') });

	// Se aplica el esquema SIN la 0009 para poder medir el antes. `initDatabase`
	// las aplica todas, asi que primero se siembra y luego se comprueba que el
	// reparto respeto lo sembrado.
	await sqlite.initDatabase();

	await sqlite.runQuery(
		`INSERT INTO items (internal_code, name, item_type, total_quantity, available_quantity, is_active)
		 VALUES ('A-1', 'Silla', 'cantidad', 200, 200, 1)`
	);
	await sqlite.runQuery(
		`INSERT INTO items (internal_code, name, item_type, total_quantity, available_quantity, is_active)
		 VALUES ('A-2', 'Consola', 'serializado', 0, 0, 1)`
	);
	const consola = (await sqlite.getQuery("SELECT id FROM items WHERE internal_code = 'A-2'"))[0];
	for (const sn of ['SN-1', 'SN-2', 'SN-3']) {
		await sqlite.runQuery(
			"INSERT INTO item_serials (item_id, serial_number, status) VALUES (?, ?, 'disponible')",
			[consola.id, sn]
		);
	}

	antes = await sqlite.getQuery(
		'SELECT id, internal_code, item_type, total_quantity FROM items ORDER BY id'
	);
	assert.equal(antes.length, 2);
});

test('0009 crea las tablas, el almacen principal y las unidades', async () => {
	assert.ok(
		typeof migracion.up === 'function' && migracion.version === '0009',
		'la migracion debe exportar `up` y su version'
	);

	const versiones = await sqlite.getQuery('SELECT version FROM schema_migrations');
	assert.ok(
		versiones.some((v) => v.version === '0009'),
		'0009 debe estar registrada en el array MIGRATIONS del runner: si se olvida, no falla nada, simplemente no se ejecuta nunca'
	);

	const principal = await sqlite.getQuery("SELECT * FROM warehouses WHERE code = 'PRIN'");
	assert.equal(principal.length, 1, 'un unico almacen «Principal»');

	const unidades = await sqlite.getQuery('SELECT name, abbr FROM units_of_measure ORDER BY id');
	assert.ok(unidades.length >= 9, `se siembran las unidades usuales, hay ${unidades.length}`);
	assert.equal(unidades[0].name, 'Unidad');
	assert.equal(unidades[0].abbr, 'ud');
});

test('el reparto es NEUTRO: ningun total se mueve', async () => {
	// Se vuelve a ejecutar para repartir los articulos sembrados despues de
	// migrar. Es idempotente por diseño —`INSERT OR IGNORE`, `WHERE ... IS
	// NULL`, `code = 'PRIN'`— y volver a pasarla es justo lo que lo demuestra.
	await migracion.up(helpers);

	for (const item of antes) {
		if (item.item_type === 'serializado') {
			// Su existencia son sus seriales: NO lleva fila en `item_stock`, o
			// habria dos numeros contradiciendose.
			const filas = await sqlite.getQuery('SELECT * FROM item_stock WHERE item_id = ?', [item.id]);
			assert.equal(filas.length, 0, 'un serializado no reparte cantidades');

			const seriales = await sqlite.getQuery(
				'SELECT COUNT(*) AS n FROM item_serials WHERE item_id = ? AND warehouse_id IS NOT NULL',
				[item.id]
			);
			assert.equal(seriales[0].n, 3, 'sus seriales quedan colocados en un almacen');
			continue;
		}

		const suma = await sqlite.getQuery(
			'SELECT COALESCE(SUM(quantity), 0) AS total FROM item_stock WHERE item_id = ?',
			[item.id]
		);
		assert.equal(
			Number(suma[0].total),
			Number(item.total_quantity),
			`el reparto de ${item.internal_code} tiene que sumar lo que habia`
		);
	}

	// Y `items.total_quantity` sigue intacto: en ESR Pro es el total, y ademas
	// es la unica forma de volver atras.
	const despues = await sqlite.getQuery(
		'SELECT id, total_quantity FROM items ORDER BY id'
	);
	for (const [i, fila] of despues.entries()) {
		assert.equal(Number(fila.total_quantity), Number(antes[i].total_quantity));
	}
});

test('todo articulo nace con unidad, y las columnas nuevas existen', async () => {
	const cols = await sqlite.getQuery('PRAGMA table_info(items)');
	for (const c of ['supplier_id', 'uom_id', 'min_stock']) {
		assert.ok(cols.some((x) => x.name === c), `falta items.${c}`);
	}

	const sinUnidad = await sqlite.getQuery('SELECT COUNT(*) AS n FROM items WHERE uom_id IS NULL');
	assert.equal(sinUnidad[0].n, 0, 'todo articulo arranca en «Unidad»');

	// `stock_movements` NO EXISTIA en SQLite: en Postgres se creo con el modelo
	// multiempresa y aqui nunca llego.
	const mov = await sqlite.getQuery('PRAGMA table_info(stock_movements)');
	assert.ok(mov.length > 0, 'stock_movements tiene que existir');
	for (const c of ['warehouse_id', 'user_id', 'type', 'quantity', 'created_at']) {
		assert.ok(mov.some((x) => x.name === c), `falta stock_movements.${c}`);
	}
});

test.after(async () => {
	await sqlite.closeSqliteDatabase();
	fs.rmSync(dir, { recursive: true, force: true });
});
