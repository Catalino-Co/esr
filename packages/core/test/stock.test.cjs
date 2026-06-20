const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateAvailableStock,
  calculateCommittedStock,
  findInsufficientStock,
  formatInsufficientStockDetail,
  shouldDeductStockForConduce
} = require('../src/index.cjs');

test('stock: calculates committed stock per item', () => {
  const committed = calculateCommittedStock([
    { item_id: 1, quantity: 2 },
    { item_id: 1, quantity: 3 },
    { item_id: 2, quantity: 1 }
  ]);

  assert.equal(committed.get(1), 5);
  assert.equal(committed.get(2), 1);
});

test('stock: available stock never goes below zero', () => {
  assert.equal(calculateAvailableStock(10, 4), 6);
  assert.equal(calculateAvailableStock(3, 8), 0);
});

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
