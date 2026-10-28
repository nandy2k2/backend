const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reclaimable } = require('../utils/crm2LeadOwnership');
test('15 day boundary is strictly greater and legacy createdAt is supported', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  assert.equal(reclaimable({ admitted: 'No', dateadded: '2026-10-12T12:00:00Z' }, now), false);
  assert.equal(reclaimable({ admitted: 'No', createdAt: '2026-10-12T11:59:59Z' }, now), true);
  assert.equal(Boolean(reclaimable({ admitted: 'No' }, now)), false);
  assert.equal(reclaimable({ admitted: 'Yes', createdAt: '2026-01-01' }, now), false);
});
