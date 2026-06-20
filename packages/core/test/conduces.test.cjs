const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildConduceReference,
  calculateConduceLineTotal,
  calculateConduceTotals,
  shouldDeductStockForConduceStatus,
  validateConduceDraft
} = require('../src/index.cjs');

test('conduces: calculates line and document totals', () => {
  assert.equal(calculateConduceLineTotal({ quantity: 3, price: 250 }), 750);

  assert.deepEqual(
    calculateConduceTotals([
      { item_id: 1, quantity: 2, price: 100 },
      { item_id: 2, quantity: 1, total: 75 }
    ], 25),
    { subtotal: 275, discount: 25, total: 250 }
  );
});

test('conduces: validates work order relation', () => {
  assert.deepEqual(validateConduceDraft({ work_order_id: '' }), {
    ok: false,
    error: 'conduce.work_order_id.required'
  });
  assert.deepEqual(validateConduceDraft({ work_order_id: 12 }), {
    ok: true,
    value: { work_order_id: 12 }
  });
});

test('conduces: stock deduction status and reference format', () => {
  assert.equal(shouldDeductStockForConduceStatus('emitido'), true);
  assert.equal(shouldDeductStockForConduceStatus('entregado'), true);
  assert.equal(shouldDeductStockForConduceStatus('anulado'), false);
  assert.equal(buildConduceReference(42), 'COND-00042');
});
