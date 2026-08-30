const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sqlite = require('../src/index.cjs');
const conexion = require('../src/connection.cjs');
const { SqliteQuoteRepository } = require('../src/repositories/sqlite-quote.repository.cjs');

/**
 * El repositorio de cotizaciones contra una base SQLite REAL, migrada desde
 * cero en un directorio temporal.
 *
 * `SqliteQuoteRepository` volvio a la vida por UN motivo —la atomicidad— y esa
 * es justo la propiedad que no se puede comprobar mirando la pantalla: un
 * guardado son `UPDATE` + `DELETE` + N `INSERT`, y lo que hay que demostrar es
 * que un fallo a mitad no deja la cotizacion con total y sin lineas. Sin esta
 * prueba, la razon de existir del modulo es una afirmacion.
 *
 * Comparte una sola base entre casos a proposito: el estado que deja cada uno
 * es la entrada del siguiente, igual que en la vida de un documento.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-sqlite-quotes-'));
const repo = new SqliteQuoteRepository();
let quoteId;

test('la base se migra desde cero', async () => {
	sqlite.connectSqliteDatabase({ dbPath: path.join(dir, 'prueba.sqlite') });
	await sqlite.initDatabase();

	const columnas = await sqlite.getQuery('PRAGMA table_info(quotations)');
	assert.ok(
		columnas.some((c) => c.name === 'tax_amount'),
		'la migracion 0006 debe anadir quotations.tax_amount'
	);

	const indices = await sqlite.getQuery('PRAGMA index_list(quotation_items)');
	assert.ok(
		indices.some((i) => i.name === 'idx_quotation_items_quotation'),
		'0006 debe crear el indice por quotation_id'
	);

	// Registrar la migracion en el array `MIGRATIONS` de `runner.cjs` es un paso
	// que no falla si se olvida: simplemente no se ejecuta nunca.
	const versiones = await sqlite.getQuery('SELECT version FROM schema_migrations');
	assert.ok(versiones.some((v) => v.version === '0006'));

	await sqlite.runQuery("INSERT INTO clients (name, is_active) VALUES ('Cliente de prueba', 1)");
	await sqlite.runQuery(
		"INSERT INTO items (internal_code, name, rental_price, is_active) VALUES ('A-1', 'Silla', 150, 1)"
	);
	await sqlite.runQuery(
		"INSERT INTO items (internal_code, name, rental_price, is_active) VALUES ('A-2', 'Mesa', 450, 1)"
	);
	await sqlite.runQuery(
		"INSERT INTO packages (name, suggested_price, is_active) VALUES ('Paquete viejo', 5000, 1)"
	);
});

test('el alta calcula los totales y resuelve nombre y codigo', async () => {
	const alta = await repo.save({
		client_id: 1,
		date: '2026-08-30',
		validity_days: 15,
		discount: 500,
		tax_amount: 300,
		status: 'borrador',
		notes: 'Prueba',
		items: [
			{ item_id: 1, package_id: null, quantity: 10, price: 150 },
			{ item_id: 2, package_id: null, quantity: 2, price: 450 }
		]
	});

	// 1500 + 900 = 2400; 2400 - 500 + 300 = 2200.
	assert.equal(Number(alta.quote.subtotal), 2400);
	assert.equal(Number(alta.quote.total), 2200);
	assert.equal(alta.items.length, 2);
	// El nombre se guarda PELADO: el adorno lo pone `quoteItemLabel` al pintar.
	assert.equal(alta.items[0].name, 'Silla');
	assert.equal(alta.items[0].code, 'A-1');

	quoteId = alta.quote.id;
});

test('los totales que manda el cliente se ignoran', async () => {
	const quote = await repo.findById(quoteId);
	const guardada = await repo.save({
		...quote,
		subtotal: 999999,
		total: 999999,
		items: [{ item_id: 1, package_id: null, quantity: 10, price: 150 }]
	});

	// Recibir los totales del renderer seria confiar en que ya recalculo, y esa
	// es exactamente la divergencia que esta reforma viene a cerrar.
	assert.equal(Number(guardada.quote.subtotal), 1500);
	assert.equal(Number(guardada.quote.total), 1300);
});

test('una linea de paquete heredada sobrevive intacta a un guardado', async () => {
	// Se inserta a mano, como estaria en la base de un cliente de verdad, y se
	// dejan los totales cuadrados: una cotizacion emitida no esta descuadrada.
	await sqlite.runQuery(
		'INSERT INTO quotation_items (quotation_id, item_id, package_id, quantity, price) VALUES (?, NULL, 1, 1, 5000)',
		[quoteId]
	);
	await sqlite.runQuery('UPDATE quotations SET subtotal = 6500, total = 6300 WHERE id = ?', [
		quoteId
	]);

	const antes = await repo.findForEdit(quoteId);
	const heredada = antes.items.find((l) => l.is_legacy_package === 1);
	assert.ok(heredada, 'package_id sin item_id debe marcarse como heredada');
	assert.equal(heredada.name, 'Paquete viejo');

	const despues = await repo.save({
		...antes.quote,
		items: antes.items.map((l) => ({
			item_id: l.item_id,
			package_id: l.package_id,
			quantity: l.quantity,
			price: l.price
		}))
	});

	// Abrir una cotizacion heredada y pulsar «Guardar» sin tocar nada no puede
	// mover el importe de un documento ya enviado al cliente.
	assert.equal(Number(despues.quote.total), Number(antes.quote.total));

	const heredadaDespues = despues.items.find((l) => l.is_legacy_package === 1);
	assert.ok(heredadaDespues);
	assert.equal(heredadaDespues.package_id, 1);
	assert.equal(heredadaDespues.item_id, null);
});

test('un fallo a mitad del guardado no se lleva las lineas por delante', async () => {
	const lineasPrevias = await repo.listItems(quoteId);
	const totalPrevio = (await repo.findById(quoteId)).total;

	// El sabotaje va en el DRIVER y no en el modulo: el repositorio desestructura
	// `runQuery` al cargarse, asi que reasignar `exports.runQuery` no cambiaria la
	// referencia que ya tiene. `runQuery` si llama a `getDatabase().run(...)` en
	// cada invocacion, y ese `run` si se puede envolver.
	const driver = conexion.getDatabase();
	const runOriginal = driver.run.bind(driver);
	let inserts = 0;
	driver.run = function (sql, params, cb) {
		if (/INSERT INTO quotation_items/i.test(sql)) {
			inserts += 1;
			if (inserts === 3) {
				// Se responde por el callback, que es como sqlite3 propaga un error.
				cb.call({ lastID: null, changes: 0 }, new Error('corte deliberado'));
				return;
			}
		}
		return runOriginal(sql, params, cb);
	};

	const cabecera = await repo.findById(quoteId);
	await assert.rejects(
		() =>
			repo.save({
				...cabecera,
				items: [
					{ item_id: 1, package_id: null, quantity: 1, price: 1 },
					{ item_id: 2, package_id: null, quantity: 1, price: 1 },
					{ item_id: 1, package_id: null, quantity: 1, price: 1 }
				]
			}),
		/corte deliberado/
	);

	driver.run = runOriginal;

	// Sin transaccion, el DELETE ya se habria llevado las filas: la cotizacion se
	// quedaria con total y sin lineas, y el DELETE es fisico.
	const lineasTrasCorte = await repo.listItems(quoteId);
	assert.equal(lineasTrasCorte.length, lineasPrevias.length);
	assert.equal(Number((await repo.findById(quoteId)).total), Number(totalPrevio));
});

test.after(async () => {
	await sqlite.closeSqliteDatabase();
	fs.rmSync(dir, { recursive: true, force: true });
});
