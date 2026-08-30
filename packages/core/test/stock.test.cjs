const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findInsufficientStock,
  formatInsufficientStockDetail,
  shouldDeductStockForConduce,
  shouldReserveStock
} = require('../src/index.cjs');

// Aqui se probaban tambien `calculateCommittedStock` y `calculateAvailableStock`.
// Se retiraron con la poda: no las llamaba nadie —ni en CommonJS ni en
// TypeScript— y desde que la disponibilidad se calcula en SQL no tenian nada
// que hacer.

test('stock: detects and formats insufficient stock', () => {
  const insufficient = findInsufficientStock(
    [
      { item_id: 1, quantity: 3 },
      { item_id: 2, quantity: 7 }
    ],
    [
      { item_id: 1, available_quantity: 4, internal_code: 'AUD-001', name: 'Bocina' },
      { item_id: 2, available_quantity: 2, internal_code: 'MIC-001', name: 'Microfono' }
    ]
  );

  assert.equal(insufficient.length, 1);
  assert.equal(insufficient[0].item_id, 2);
  assert.equal(formatInsufficientStockDetail(insufficient), 'MIC-001 Microfono');
});

test('stock: aggregates duplicated lines before comparing', () => {
  // El fallo que tenia: comparaba LINEA A LINEA, asi que 3 y 4 unidades del
  // mismo articulo pasaban por separado contra 5 disponibles y luego se
  // descontaban 7.
  const rows = [
    { item_id: 1, quantity: 3, available_quantity: 5, internal_code: 'A-1', name: 'Bocina' },
    { item_id: 1, quantity: 4, available_quantity: 5, internal_code: 'A-1', name: 'Bocina' }
  ];

  const insufficient = findInsufficientStock(rows, rows);
  assert.equal(insufficient.length, 1);
  assert.equal(insufficient[0].quantity, 7);
});

test('stock: requested quantity wins over the stock row', () => {
  // Con dos arrays distintos, la cantidad PEDIDA manda. Al reves se comparaba
  // el stock contra si mismo sin avisar.
  const insufficient = findInsufficientStock(
    [{ item_id: 1, quantity: 9 }],
    [{ item_id: 1, quantity: 1, available_quantity: 5, internal_code: 'A-1', name: 'Bocina' }]
  );

  assert.equal(insufficient.length, 1);
  assert.equal(insufficient[0].quantity, 9);
});

test('stock: conduce deducting statuses are explicit', () => {
  assert.equal(shouldDeductStockForConduce('emitido'), true);
  assert.equal(shouldDeductStockForConduce('entregado'), true);
  assert.equal(shouldDeductStockForConduce('anulado'), false);
});

test('stock: reserving statuses are explicit', () => {
  assert.equal(shouldReserveStock('preparado'), true);
  assert.equal(shouldReserveStock('cargado'), true);
  assert.equal(shouldReserveStock('confirmado'), false);
});
