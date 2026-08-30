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
  {
    nombre: 'sin lineas',
    items: [], discount: 0, tax: 0
  },
  {
    nombre: 'una linea, sin descuento ni impuesto',
    items: [{ quantity: 3, price: 100 }], discount: 0, tax: 0
  },
  {
    nombre: 'descuento e impuesto son IMPORTES, no porcentajes',
    items: [{ quantity: 2, price: 500 }], discount: 150, tax: 63
  },
  {
    nombre: 'el descuento puede superar al subtotal y el total va en negativo',
    items: [{ quantity: 1, price: 10 }], discount: 50, tax: 0
  },
  {
    nombre: 'una linea con total 0 explicito NO se recalcula',
    items: [{ quantity: 4, price: 25, total: 0 }], discount: 0, tax: 0
  },
  {
    nombre: 'el `total` de la linea manda sobre cantidad por precio',
    items: [{ quantity: 4, price: 25, total: 7 }], discount: 0, tax: 0
  },
  {
    nombre: 'los NUMERIC de PostgreSQL llegan como cadena',
    items: [{ quantity: '3', price: '19.99' }], discount: '5.50', tax: '2.25'
  },
  {
    nombre: 'valores ausentes cuentan como cero',
    items: [{ quantity: undefined, price: null }], discount: undefined, tax: null
  },
  {
    nombre: 'varias lineas',
    items: [
      { quantity: 1, price: 1200 },
      { quantity: 10, price: 35.5 },
      { quantity: 2, price: 0 }
    ],
    discount: 100,
    tax: 90
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
      cjs.calculateQuoteTotals(caso.items, caso.discount, caso.tax),
      ts.calculateQuoteTotals(caso.items, caso.discount, caso.tax),
      `divergen en: ${caso.nombre}`
    );
  }
});

test('quote totals: el total de linea coincide en las dos', (t) => {
  if (!ts) {
    t.skip('esbuild no se pudo resolver');
    return;
  }

  for (const linea of [
    { quantity: 3, price: 100 },
    { quantity: '3', price: '19.99' },
    { quantity: 0, price: 500 },
    { quantity: undefined, price: null }
  ]) {
    assert.equal(
      cjs.calculateQuoteLineTotal(linea),
      ts.calculateQuoteLineTotal(linea),
      `divergen en ${JSON.stringify(linea)}`
    );
  }
});

test('quote totals: la forma del resultado es la esperada', () => {
  const totales = cjs.calculateQuoteTotals([{ quantity: 2, price: 500 }], 150, 63);
  assert.deepEqual(totales, { subtotal: 1000, discount: 150, tax_amount: 63, total: 913 });
});

test('quote totals: una linea de cortesia no se recalcula', () => {
  // `?? calculateQuoteLineTotal(item)` y no `|| ...`: con `||`, un total 0
  // legitimo se sustituiria por cantidad × precio y la cortesia se cobraria.
  const totales = cjs.calculateQuoteTotals([{ quantity: 4, price: 25, total: 0 }]);
  assert.equal(totales.subtotal, 0);
  assert.equal(totales.total, 0);
});
