const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sqlite = require('../src/index.cjs');
const volcado = require('../src/migrations/versioned/0010_item_inventory.cjs');
const borrado = require('../src/migrations/versioned/0011_drop_legacy_item_columns.cjs');

/**
 * Las migraciones 0010 y 0011 sobre el CAMINO REAL de actualizacion.
 *
 * Van juntas porque son las dos mitades de un mismo movimiento y la segunda
 * destruye la evidencia de la primera: la 0010 COPIA el minimo, el estado fisico
 * y la ubicacion a `item_inventory`, y la 0011 borra las columnas de origen.
 * Probar la 0010 despues de la 0011 seria imposible, y probarla sin la 0011
 * dejaria sin comprobar justamente el paso que no tiene vuelta.
 *
 * Se cubren los tres casos que se comportan distinto en el volcado:
 *   - ficha COMPLETA        -> se copia tal cual
 *   - `status` vacio o NULL -> cae en «disponible», no en cadena vacia
 *   - `min_stock` NULL      -> cae en 0, no en NULL
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-inventario-'));

/** Lo que la ficha de cada articulo decia ANTES de 0010. */
let antes;

test('se siembra una base con el esquema ANTERIOR a 0010', async () => {
	sqlite.connectSqliteDatabase({ dbPath: path.join(dir, 'prueba.sqlite') });

	// Hasta la 0009: `items` todavia lleva minimo, estado fisico y ubicacion, y
	// no existe `item_inventory` donde mudarlos.
	await sqlite.initDatabase({ upTo: '0009' });

	const tablas = await sqlite.getQuery(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'item_inventory'"
	);
	assert.equal(tablas.length, 0, 'antes de 0010 no puede existir `item_inventory`');

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

test('0010 crea la tabla y las dos columnas nuevas', async () => {
	assert.ok(
		typeof volcado.up === 'function' && volcado.version === '0010',
		'la migracion debe exportar `up` y su version'
	);

	await sqlite.initDatabase({ upTo: '0010' });

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

test('entre 0010 y 0011 las columnas viejas SIGUEN ahi', async () => {
	// La ventana para mirar, comparar y volver atras. Si el volcado y el borrado
	// fueran una sola migracion, esta comprobacion no existiria y un volcado malo
	// se llevaria el dato de partida por delante.
	const cols = await sqlite.getQuery('PRAGMA table_info(items)');
	for (const c of ['min_stock', 'status', 'location']) {
		assert.ok(cols.some((x) => x.name === c), `items.${c} no debe borrarse en la 0010`);
	}

	const despues = await sqlite.getQuery(
		'SELECT id, min_stock, status, location FROM items ORDER BY id'
	);
	assert.deepEqual(
		despues,
		antes.map((f) => ({
			id: f.id,
			min_stock: f.min_stock,
			status: f.status,
			location: f.location
		}))
	);
});

test('0011 borra las tres columnas y NO toca el motor de reservas', async () => {
	assert.ok(
		typeof borrado.up === 'function' && borrado.version === '0011',
		'la migracion debe exportar `up` y su version'
	);

	await sqlite.initDatabase();

	const cols = (await sqlite.getQuery('PRAGMA table_info(items)')).map((c) => c.name);

	for (const c of ['min_stock', 'status', 'location']) {
		assert.ok(!cols.includes(c), `items.${c} tenia que desaparecer`);
	}

	// En ESR Pro estas dos NO son un espejo del stock: son el motor de reservas
	// —`available_quantity` se mantiene restando al comprometer— y de ahi las
	// leen la conversion a orden, el conduce y la comprobacion de stock. Cloud si
	// las borra, porque alli el total se calcula.
	for (const c of ['total_quantity', 'available_quantity']) {
		assert.ok(cols.includes(c), `items.${c} es el motor de ESR Pro y tiene que quedarse`);
	}

	// Y el dato mudado sigue donde debe: borrar la columna no puede llevarselo.
	const filas = await sqlite.getQuery(
		'SELECT item_id, min_stock, physical_status, location FROM item_inventory ORDER BY item_id'
	);
	assert.equal(filas.length, antes.length);
	assert.equal(filas[0].min_stock, 25);
	assert.equal(filas[0].physical_status, 'mantenimiento');
	assert.equal(filas[0].location, 'Pasillo 3');
});

test('volver a pasar 0011 no rompe: las columnas ya no estan', async () => {
	// Idempotencia. `columnExists` corta antes del ALTER, asi que una base que ya
	// paso por aqui no revienta si la migracion se ejecuta otra vez.
	await borrado.up({
		async columnExists(tabla, columna) {
			const filas = await sqlite.getQuery(`PRAGMA table_info(${tabla})`);
			return filas.some((f) => f.name === columna);
		}
	});

	const cols = (await sqlite.getQuery('PRAGMA table_info(items)')).map((c) => c.name);
	assert.ok(!cols.includes('status'));
	assert.ok(cols.includes('total_quantity'));
});

test.after(async () => {
	await sqlite.closeSqliteDatabase();
	fs.rmSync(dir, { recursive: true, force: true });
});
