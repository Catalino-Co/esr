const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const cjs = require('../src/index.cjs');

/**
 * La formula de los totales de una cotizacion esta escrita DOS VECES:
 *
 *   - `src/quotes/use-cases.ts`  → la usa el servidor de Cloud (`syncTotals`) y
 *     la pantalla de Cloud, por la rama `import` de los exports condicionales.
 *   - `src/index.cjs`            → la usa `sqlite-quote.repository.cjs`, que
 *     corre en el proceso principal de Electron y no puede cargar TypeScript.
 *
 * Que las dos diverjan significa que el total que ve el usuario y el que se
 * escribe en disco dejan de coincidir, sin ningun error por el camino. Esta
 * prueba EJECUTA las dos y compara.
 *
 * Como se carga el TypeScript: se transforma con esbuild en memoria y se
 * ejecuta con un `require` falso. `calculateQuoteTotals` no usa ninguno de los
 * dos imports del modulo, asi que los sustitutos solo tienen que existir.
 *
 * `require('node:test')` no trae `describe.skip` condicional comodo, asi que si
 * esbuild no estuviera disponible la comparacion se salta con aviso en vez de
 * tumbar la suite: esbuild llega aqui por el arbol de Vite, no como dependencia
 * declarada de este paquete. Si algun dia deja de resolverse, declararlo como
 * devDependency de @esr/core.
 */
function cargarGemeloTypeScript() {
  let transformSync;
  try {
    ({ transformSync } = require('esbuild'));
  } catch {
    return null;
  }

  const ruta = path.join(__dirname, '..', 'src', 'quotes', 'use-cases.ts');
  const { code } = transformSync(fs.readFileSync(ruta, 'utf8'), {
    loader: 'ts',
    format: 'cjs'
  });

  const modulo = { exports: {} };
  const requireFalso = (id) => {
    if (id === '@esr/schemas') return { validateQuoteInput: () => ({ valid: true }) };
    if (id === '../shared/result') {
      return { ok: (value) => ({ ok: true, value }), fail: (error) => ({ ok: false, error }) };
    }
    throw new Error(`El gemelo no deberia necesitar «${id}»: revise la prueba.`);
  };

  new Function('module', 'exports', 'require', code)(modulo, modulo.exports, requireFalso);
  return modulo.exports;
}

/** Casos que cubren lo que distingue a esta formula de una suma cualquiera. */
const CASOS = [
  { nombre: 'sin lineas', items: [] },
  {
    nombre: 'una linea, sin descuento ni impuesto',
    items: [{ quantity: 3, price: 100 }]
  },
  {
    nombre: 'las tasas son PORCENTAJES, no importes',
    items: [{ quantity: 2, price: 500, discount_rate: 15, tax_rate: 18 }]
  },
  {
    nombre: 'el impuesto va sobre la base YA rebajada, no sobre el bruto',
    items: [{ quantity: 1, price: 1000, discount_rate: 50, tax_rate: 18 }]
  },
  {
    nombre: 'tasas por linea distintas en la misma cotizacion',
    items: [
      { quantity: 200, price: 150, discount_rate: 0, tax_rate: 18 },
      { quantity: 2, price: 1200, discount_rate: 5, tax_rate: 18 },
      { quantity: 1, price: 800, discount_rate: 0, tax_rate: 0 }
    ]
  },
  {
    nombre: 'un descuento del 100% deja la linea en cero',
    items: [{ quantity: 3, price: 400, discount_rate: 100, tax_rate: 18 }]
  },
  {
    nombre: 'una linea con total 0 explicito NO se recalcula',
    items: [{ quantity: 4, price: 25, total: 0, tax_rate: 18 }]
  },
  {
    nombre: 'el `total` de la linea manda sobre cantidad por precio',
    items: [{ quantity: 4, price: 25, total: 7, tax_rate: 18 }]
  },
  {
    nombre: 'los NUMERIC de PostgreSQL llegan como cadena',
    items: [{ quantity: '3', price: '19.99', discount_rate: '2.5', tax_rate: '18' }]
  },
  {
    nombre: 'valores ausentes cuentan como cero',
    items: [{ quantity: undefined, price: null, discount_rate: null, tax_rate: undefined }]
  },
  {
    nombre: 'fracciones de centimo: se redondea por linea y luego se suma',
    items: [
      { quantity: 3, price: 33.33, tax_rate: 18 },
      { quantity: 7, price: 1.11, discount_rate: 3, tax_rate: 18 },
      { quantity: 11, price: 0.07, tax_rate: 18 }
    ]
  }
];

const ts = cargarGemeloTypeScript();

test('quote totals: las dos implementaciones dan lo mismo', (t) => {
  if (!ts) {
    t.skip('esbuild no se pudo resolver: no se compara contra el TypeScript');
    return;
  }

  for (const caso of CASOS) {
    assert.deepEqual(
      cjs.calculateQuoteTotals(caso.items),
      ts.calculateQuoteTotals(caso.items),
      `divergen en: ${caso.nombre}`
    );
  }
});

test('quote totals: el desglose de linea coincide en las dos', (t) => {
  if (!ts) {
    t.skip('esbuild no se pudo resolver');
    return;
  }

  for (const linea of CASOS.flatMap((c) => c.items)) {
    assert.deepEqual(
      cjs.calculateQuoteLineAmounts(linea),
      ts.calculateQuoteLineAmounts(linea),
      `divergen en ${JSON.stringify(linea)}`
    );
    assert.equal(
      cjs.calculateQuoteLineTotal(linea),
      ts.calculateQuoteLineTotal(linea),
      `bruto divergente en ${JSON.stringify(linea)}`
    );
  }
});

test('quote totals: la forma del resultado es la esperada', () => {
  // El caso de la vista previa que aprobo el usuario, cifra a cifra.
  const totales = cjs.calculateQuoteTotals([
    { quantity: 200, price: 150, discount_rate: 0, tax_rate: 18 },
    { quantity: 2, price: 1200, discount_rate: 5, tax_rate: 18 }
  ]);
  assert.deepEqual(totales, {
    subtotal: 32400,
    discount: 120,
    tax_amount: 5810.4,
    total: 38090.4
  });
});

test('quote totals: el total es la suma de los importes impresos', () => {
  // La identidad que sostiene el bloque de totales. Si se rompe, el documento
  // enseña unas lineas que no suman lo que dice el total.
  const items = [
    { quantity: 3, price: 33.33, tax_rate: 18 },
    { quantity: 7, price: 1.11, discount_rate: 3, tax_rate: 18 },
    { quantity: 11, price: 0.07, tax_rate: 18 }
  ];
  const totales = cjs.calculateQuoteTotals(items);
  const sumaDeImportes = cjs.round2(
    items.reduce((s, l) => s + cjs.calculateQuoteLineAmounts(l).total, 0)
  );
  assert.equal(totales.total, sumaDeImportes);
  assert.equal(totales.total, cjs.round2(totales.subtotal - totales.discount + totales.tax_amount));
});

test('quote totals: el impuesto NO se cobra sobre lo que se rebaja', () => {
  // 1000 con 50% de descuento: la base son 500 y el ITBIS son 90, no 180.
  const totales = cjs.calculateQuoteTotals([
    { quantity: 1, price: 1000, discount_rate: 50, tax_rate: 18 }
  ]);
  assert.equal(totales.discount, 500);
  assert.equal(totales.tax_amount, 90);
  assert.equal(totales.total, 590);
});

test('quote totals: una linea de cortesia no se recalcula', () => {
  // `?? calculateQuoteLineTotal(item)` y no `|| ...`: con `||`, un total 0
  // legitimo se sustituiria por cantidad × precio y la cortesia se cobraria.
  const totales = cjs.calculateQuoteTotals([{ quantity: 4, price: 25, total: 0, tax_rate: 18 }]);
  assert.equal(totales.subtotal, 0);
  assert.equal(totales.tax_amount, 0);
  assert.equal(totales.total, 0);
});
