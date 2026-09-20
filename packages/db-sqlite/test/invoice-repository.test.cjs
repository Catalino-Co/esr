const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sqlite = require('../src/index.cjs');
const { SqliteInvoiceRepository } = require('../src/repositories/sqlite-invoice.repository.cjs');
const { SqliteQuoteRepository } = require('../src/repositories/sqlite-quote.repository.cjs');

/**
 * Facturacion independiente contra una base SQLite REAL, migrada desde cero.
 *
 * Lo que demuestra esta prueba es justo lo que no se ve mirando la pantalla:
 * que facturar una cotizacion DIRECTO y por partes no permite cobrar dos
 * veces la misma cantidad, que anular libera exactamente lo que se cobro -ni
 * mas ni menos-, y que una cotizacion con una linea ya facturada no se puede
 * volver a guardar completa (lo que desengancharia el enlace en silencio).
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-sqlite-invoices-'));
const invoices = new SqliteInvoiceRepository();
const quotes = new SqliteQuoteRepository();
const pagosFalsos = { txVoidByInvoice: async () => 0 };

let quoteId;
let clientId;
let serviceId;
let primeraFacturaId;
let lineaId;

test('la base se migra desde cero, con las tablas de facturacion independiente', async () => {
  sqlite.connectSqliteDatabase({ dbPath: path.join(dir, 'prueba.sqlite') });
  await sqlite.initDatabase();

  const columnasFactura = await sqlite.getQuery('PRAGMA table_info(invoices)');
  assert.ok(columnasFactura.some((c) => c.name === 'quotation_id'), '0025 debe añadir invoices.quotation_id');

  const columnasLinea = await sqlite.getQuery('PRAGMA table_info(invoice_items)');
  for (const columna of ['discount_rate', 'tax_rate']) {
    assert.ok(columnasLinea.some((c) => c.name === columna), `0025 debe añadir invoice_items.${columna}`);
  }

  const versiones = await sqlite.getQuery('SELECT version FROM schema_migrations');
  assert.ok(versiones.some((v) => v.version === '0025'));

  const cliente = await sqlite.runQuery("INSERT INTO clients (name, is_active) VALUES ('Cliente de prueba', 1)");
  clientId = cliente.id;
  await sqlite.runQuery(
    "INSERT INTO items (internal_code, name, rental_price, is_active) VALUES ('A-1', 'Silla', 150, 1)"
  );
  const servicio = await sqlite.runQuery(
    "INSERT INTO services (name, price, is_active) VALUES ('Maestría de Ceremonias', 8000, 1)"
  );
  serviceId = servicio.id;
});

test('factura libre: cliente + servicio + cargo manual, sin cotización ni orden', async () => {
  const factura = await invoices.create({
    source: {
      kind: 'free',
      client_id: clientId,
      lines: [
        { service_id: serviceId, quantity: 1, price: 8000 },
        { description: 'Recargo por transporte', quantity: 1, price: 500 }
      ]
    },
    date: '2026-09-16'
  });

  assert.equal(Number(factura.total), 8500);

  const cabecera = await invoices.findById(factura.id);
  assert.equal(cabecera.work_order_id, null);
  assert.equal(cabecera.quotation_id, null);
  assert.equal(cabecera.client_id, clientId);

  const lineas = await invoices.listItems(factura.id);
  assert.equal(lineas.length, 2);
  assert.ok(lineas.some((l) => l.service_id === serviceId && Number(l.total) === 8000));
  assert.ok(lineas.some((l) => l.item_id === null && l.service_id === null && l.description === 'Recargo por transporte'));
});

test('factura libre rechaza un servicio inactivo', async () => {
  await sqlite.runQuery('UPDATE services SET is_active = 2 WHERE id = ?', [serviceId]);
  await assert.rejects(
    () =>
      invoices.create({
        source: { kind: 'free', client_id: clientId, lines: [{ service_id: serviceId, quantity: 1, price: 8000 }] }
      }),
    /inactivo o archivado/
  );
  await sqlite.runQuery('UPDATE services SET is_active = 1 WHERE id = ?', [serviceId]);
});

test('preparación: una cotización aprobada con una línea de 5 unidades', async () => {
  const alta = await quotes.save({
    client_id: clientId,
    date: '2026-09-16',
    status: 'aprobada',
    items: [{ item_id: 1, package_id: null, quantity: 5, price: 150, discount_rate: 0, tax_rate: 18 }]
  });
  quoteId = alta.quote.id;
  assert.equal(alta.items.length, 1);
});

test('cotización: facturar directo 2 de 5 unidades deja 3 pendientes', async () => {
  const billables = await invoices.listBillableQuotationItems(quoteId);
  assert.equal(billables.length, 1);
  assert.equal(Number(billables[0].remaining), 5);
  lineaId = billables[0].id;

  const factura = await invoices.create({
    source: { kind: 'quotation', quotation_id: quoteId, lines: [{ quotation_item_id: lineaId, quantity: 2 }] }
  });

  // 2 x 150 = 300 bruto, sin descuento, ITBIS 18% -> 54.
  // `create()` solo devuelve id/numero/total (ver `txInsertHeaderWithNumber`);
  // el resto se relee con `findById`, igual que hace la pantalla.
  assert.equal(Number(factura.total), 354);

  const cabecera = await invoices.findById(factura.id);
  assert.equal(cabecera.quotation_id, quoteId);
  assert.equal(cabecera.client_id, clientId);
  assert.equal(Number(cabecera.subtotal), 300);
  assert.equal(Number(cabecera.tax_amount), 54);
  assert.equal(Number(cabecera.total), 354);

  const pendientesDespues = await invoices.listBillableQuotationItems(quoteId);
  assert.equal(Number(pendientesDespues[0].remaining), 3);

  primeraFacturaId = factura.id;
});

test('cotización: no se puede facturar más de lo que queda pendiente', async () => {
  await assert.rejects(
    () =>
      invoices.create({
        source: { kind: 'quotation', quotation_id: quoteId, lines: [{ quotation_item_id: lineaId, quantity: 4 }] }
      }),
    /ya se facturó o cambió de cantidad/
  );
});

test('cotización: una línea ya facturada no se puede editar ni quitar', async () => {
  await assert.rejects(
    () => quotes.save({ id: quoteId, client_id: clientId, items: [{ item_id: 1, package_id: null, quantity: 1, price: 999 }] }),
    /ya tiene líneas facturadas/
  );
});

test('anular la factura de cotización libera la cantidad facturada', async () => {
  await invoices.cancel(primeraFacturaId, 'Prueba de anulación', pagosFalsos);

  const pendientesTrasAnular = await invoices.listBillableQuotationItems(quoteId);
  assert.equal(Number(pendientesTrasAnular[0].remaining), 5);

  const enlaces = await invoices.listQuotationItems(primeraFacturaId);
  assert.equal(enlaces.length, 1);
  assert.equal(Number(enlaces[0].is_active), 0);
});

test('cotización: ahora que ya no hay nada facturado, se puede volver a editar', async () => {
  const guardada = await quotes.save({
    id: quoteId,
    client_id: clientId,
    date: '2026-09-16',
    status: 'aprobada',
    items: [{ item_id: 1, package_id: null, quantity: 6, price: 150, discount_rate: 0, tax_rate: 18 }]
  });
  assert.equal(Number(guardada.items[0].quantity), 6);
});

test('cotización: solo se factura directo una cotización aprobada', async () => {
  const billables = await invoices.listBillableQuotationItems(quoteId);
  await sqlite.runQuery("UPDATE quotations SET status = 'borrador' WHERE id = ?", [quoteId]);

  await assert.rejects(
    () =>
      invoices.create({
        source: { kind: 'quotation', quotation_id: quoteId, lines: [{ quotation_item_id: billables[0].id, quantity: 1 }] }
      }),
    /aprobada/
  );

  await sqlite.runQuery("UPDATE quotations SET status = 'convertida' WHERE id = ?", [quoteId]);
  await assert.rejects(
    () =>
      invoices.create({
        source: { kind: 'quotation', quotation_id: quoteId, lines: [{ quotation_item_id: billables[0].id, quantity: 1 }] }
      }),
    /aprobada/
  );

  await sqlite.runQuery("UPDATE quotations SET status = 'aprobada' WHERE id = ?", [quoteId]);
});

test.after(async () => {
  await sqlite.closeSqliteDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});
