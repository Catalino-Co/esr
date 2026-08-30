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
