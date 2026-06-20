const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isSerializedInventoryItem,
  normalizeSerializedInventoryInput,
  normalizeSerializedRentalLine,
  parseSerialLines,
  uniqueSerialLines,
  validateSerialCatalogInput,
  validateSerializedRentalLines
} = require('../src/index.cjs');

test('serials: parses lines and removes blank values', () => {
  assert.deepEqual(parseSerialLines(' A-1 \n\nB-2\r\n C-3 '), ['A-1', 'B-2', 'C-3']);
});

test('serials: validates serialized catalog input with unique serials', () => {
  assert.deepEqual(uniqueSerialLines(['A', 'A', 'B']), ['A', 'B']);
  assert.deepEqual(validateSerialCatalogInput([]), { ok: false, error: 'serials.required' });
  assert.deepEqual(validateSerialCatalogInput(['A', 'A', 'B']), { ok: true, value: ['A', 'B'] });
});

test('serials: normalizes serialized inventory quantities from serial catalog', () => {
  const item = normalizeSerializedInventoryInput(
    { name: 'Bocina', category_id: 1, item_type: 'serializado', uses_serial: 1, total_quantity: 99 },
    ['S-1', 'S-1', 'S-2']
  );

  assert.equal(isSerializedInventoryItem(item), true);
  assert.equal(item.total_quantity, 2);
  assert.equal(item.available_quantity, 2);
});

test('serials: non-serialized inventory stays quantity-based', () => {
  const item = normalizeSerializedInventoryInput(
    { name: 'Cable', category_id: 1, item_type: 'cantidad', uses_serial: 0, total_quantity: 10 },
    ['IGNORED']
  );

  assert.equal(item.item_type, 'cantidad');
  assert.equal(item.uses_serial, 0);
  assert.equal(item.total_quantity, 10);
});

test('serials: rental lines require selected serials and derive quantity', () => {
  const invalid = validateSerializedRentalLines([
    { item_id: 7, item_type: 'serializado', uses_serial: 1, quantity: 1, serial_ids: [] }
  ]);

  assert.deepEqual(invalid, { ok: false, error: 'serials.selection.required:7' });

  const valid = validateSerializedRentalLines([
    { item_id: 7, item_type: 'serializado', uses_serial: 1, quantity: 99, serial_ids: [10, 11] },
    { item_id: 8, item_type: 'cantidad', uses_serial: 0, quantity: 5 }
  ]);

  assert.equal(valid.ok, true);
  assert.equal(valid.value[0].quantity, 2);
  assert.deepEqual(normalizeSerializedRentalLine(valid.value[0]).serial_ids, [10, 11]);
});
