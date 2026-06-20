const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getIncidentSeverityTone,
  getIncidentStatusBadgeKind,
  validateIncidentDraft
} = require('../src/index.cjs');

test('incidents: validates required item relation', () => {
  assert.deepEqual(validateIncidentDraft({ item_id: '' }), {
    ok: false,
    error: 'incident.item_id.required'
  });
  assert.deepEqual(validateIncidentDraft({ item_id: 5 }), {
    ok: true,
    value: { item_id: 5 }
  });
});

test('incidents: maps statuses to badge kinds', () => {
  assert.equal(getIncidentStatusBadgeKind('resuelto'), 'success');
  assert.equal(getIncidentStatusBadgeKind('cobrado'), 'success');
  assert.equal(getIncidentStatusBadgeKind('reportado'), 'secondary');
  assert.equal(getIncidentStatusBadgeKind('en reparación'), 'warning');
  assert.equal(getIncidentStatusBadgeKind('pérdida total'), 'danger');
  assert.equal(getIncidentStatusBadgeKind('otro'), 'primary');
});

test('incidents: maps severity to UI tone', () => {
  assert.equal(getIncidentSeverityTone('alta'), 'danger');
  assert.equal(getIncidentSeverityTone('media'), 'warning');
  assert.equal(getIncidentSeverityTone('baja'), 'info');
  assert.equal(getIncidentSeverityTone(), 'info');
});
