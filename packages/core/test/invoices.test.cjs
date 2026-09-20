const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const cjs = require('../src/index.cjs');

/**
 * `validateInvoiceDraft`/`invoiceLineKind` estan escritas DOS VECES, igual que
 * `calculateQuoteTotals` (ver `quote-totals.test.cjs`): una en
 * `src/invoices/use-cases.ts` (Cloud, via `import`) y otra en `src/index.cjs`
 * (Desktop, `sqlite-invoice.repository.cjs`, que no puede cargar TypeScript).
 * Esta prueba EJECUTA las dos y compara, para que una factura rechazada en una
 * app y aceptada en la otra sea imposible por construccion.
 */
function cargarGemeloTypeScript() {
  let transformSync;
  try {
    ({ transformSync } = require('esbuild'));
  } catch {
    return null;
  }

  const ruta = path.join(__dirname, '..', 'src', 'invoices', 'use-cases.ts');
  const { code } = transformSync(fs.readFileSync(ruta, 'utf8'), {
    loader: 'ts',
    format: 'cjs'
  });

  const modulo = { exports: {} };
  const requireFalso = (id) => {
    if (id === '@esr/schemas') return {};
    if (id === '../shared/result') {
      return { ok: (value) => ({ ok: true, value }), fail: (error) => ({ ok: false, error }) };
    }
    throw new Error(`El gemelo no deberia necesitar «${id}»: revise la prueba.`);
  };

  new Function('module', 'exports', 'require', code)(modulo, modulo.exports, requireFalso);
  return modulo.exports;
}

const ts = cargarGemeloTypeScript();

/** Un borrador valido de cada origen, para mutar un solo campo por caso. */
const ORDEN_VALIDA = {
  source: { kind: 'work_order', work_order_id: 7, conduce_ids: [1], service_line_ids: [] }
};
const COTIZACION_VALIDA = {
  source: { kind: 'quotation', quotation_id: 3, lines: [{ quotation_item_id: 10, quantity: 2 }] }
};
const LIBRE_VALIDA = {
  source: {
    kind: 'free',
    client_id: 5,
    lines: [{ service_id: 1, quantity: 1, price: 500 }, { description: 'Cargo por transporte', quantity: 1, price: 200 }]
  }
};

const CASOS = [
  { nombre: 'orden valida', draft: ORDEN_VALIDA, ok: true },
  {
    nombre: 'orden sin work_order_id',
    draft: { source: { ...ORDEN_VALIDA.source, work_order_id: '' } },
    ok: false,
    error: 'invoice.order.required'
  },
  {
    nombre: 'orden sin conduces ni servicios',
    draft: { source: { ...ORDEN_VALIDA.source, conduce_ids: [], service_line_ids: [] } },
    ok: false,
    error: 'invoice.order.lines_required'
  },
  { nombre: 'cotizacion valida', draft: COTIZACION_VALIDA, ok: true },
  {
    nombre: 'cotizacion sin quotation_id',
    draft: { source: { ...COTIZACION_VALIDA.source, quotation_id: '' } },
    ok: false,
    error: 'invoice.quotation.required'
  },
  {
    nombre: 'cotizacion sin lineas',
    draft: { source: { ...COTIZACION_VALIDA.source, lines: [] } },
    ok: false,
    error: 'invoice.quotation.lines_required'
  },
  {
    nombre: 'cotizacion con cantidad en cero',
    draft: { source: { ...COTIZACION_VALIDA.source, lines: [{ quotation_item_id: 10, quantity: 0 }] } },
    ok: false,
    error: 'invoice.line.quantity_invalid'
  },
  { nombre: 'libre valida, mezcla servicio y cargo manual', draft: LIBRE_VALIDA, ok: true },
  {
    nombre: 'libre sin cliente',
    draft: { source: { ...LIBRE_VALIDA.source, client_id: '' } },
    ok: false,
    error: 'invoice.client.required'
  },
  {
    nombre: 'libre sin lineas',
    draft: { source: { ...LIBRE_VALIDA.source, lines: [] } },
    ok: false,
    error: 'invoice.lines.required'
  },
  {
    nombre: 'libre: articulo y servicio a la vez es invalido',
    draft: { source: { ...LIBRE_VALIDA.source, lines: [{ item_id: 1, service_id: 2, quantity: 1, price: 100 }] } },
    ok: false,
    error: 'invoice.line.both_refs'
  },
  {
    nombre: 'libre: cargo manual sin descripcion es invalido',
    draft: { source: { ...LIBRE_VALIDA.source, lines: [{ quantity: 1, price: 100 }] } },
    ok: false,
    error: 'invoice.line.unidentified'
  },
  {
    nombre: 'libre: precio negativo es invalido',
    draft: { source: { ...LIBRE_VALIDA.source, lines: [{ description: 'X', quantity: 1, price: -1 }] } },
    ok: false,
    error: 'invoice.line.price_invalid'
  },
  {
    nombre: 'libre: tasa de descuento fuera de rango es invalida',
    draft: { source: { ...LIBRE_VALIDA.source, lines: [{ description: 'X', quantity: 1, price: 100, discount_rate: 150 }] } },
    ok: false,
    error: 'invoice.line.rate_invalid'
  },
  {
    nombre: 'origen desconocido se rechaza (defensa contra un POST manipulado)',
    draft: { source: { kind: 'otra-cosa' } },
    ok: false,
    error: 'invoice.source.invalid'
  },
  {
    nombre: 'descuento de cabecera negativo es invalido',
    draft: { ...ORDEN_VALIDA, discount: -5 },
    ok: false,
    error: 'invoice.discount.invalid'
  }
];

test('validateInvoiceDraft: las dos implementaciones dan el mismo resultado', (t) => {
  if (!ts) {
    t.skip('esbuild no se pudo resolver: no se compara contra el TypeScript');
    return;
  }

  for (const caso of CASOS) {
    assert.deepEqual(
      cjs.validateInvoiceDraft(caso.draft),
      ts.validateInvoiceDraft(caso.draft),
      `divergen en: ${caso.nombre}`
    );
  }
});

test('validateInvoiceDraft: acepta o rechaza lo esperado, con el codigo esperado', () => {
  for (const caso of CASOS) {
    const resultado = cjs.validateInvoiceDraft(caso.draft);
    assert.equal(resultado.ok, caso.ok, `caso: ${caso.nombre}`);
    if (!caso.ok) assert.equal(resultado.error, caso.error, `caso: ${caso.nombre}`);
  }
});

test('invoiceLineKind: coincide en las dos implementaciones', (t) => {
  if (!ts) {
    t.skip('esbuild no se pudo resolver');
    return;
  }

  const lineas = [{ item_id: 1, service_id: null }, { item_id: null, service_id: 2 }, { item_id: null, service_id: null }];
  for (const linea of lineas) {
    assert.equal(cjs.invoiceLineKind(linea), ts.invoiceLineKind(linea), `divergen en ${JSON.stringify(linea)}`);
  }
});

test('invoiceLineKind: articulo, servicio y cargo manual se distinguen', () => {
  assert.equal(cjs.invoiceLineKind({ item_id: 1, service_id: null }), 'item');
  assert.equal(cjs.invoiceLineKind({ item_id: null, service_id: 2 }), 'service');
  assert.equal(cjs.invoiceLineKind({ item_id: null, service_id: null }), 'manual');
});

test('validateQuoteCanInvoiceDirectly: solo una cotizacion aprobada con algo pendiente', () => {
  assert.equal(cjs.validateQuoteCanInvoiceDirectly({ status: 'borrador' }, [{}]).ok, false);
  assert.equal(cjs.validateQuoteCanInvoiceDirectly({ status: 'convertida' }, [{}]).ok, false);
  assert.equal(cjs.validateQuoteCanInvoiceDirectly({ status: 'aprobada' }, []).ok, false);
  assert.equal(cjs.validateQuoteCanInvoiceDirectly({ status: 'aprobada' }, [{}]).ok, true);
});

test('invoiceDraftErrorMessage: cada codigo tiene un mensaje en español', () => {
  for (const caso of CASOS) {
    if (caso.ok) continue;
    const mensaje = cjs.invoiceDraftErrorMessage(caso.error);
    assert.notEqual(mensaje, 'No se pudo emitir la factura.', `falta mensaje para ${caso.error}`);
  }
});
