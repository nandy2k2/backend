const test = require('node:test'), assert = require('node:assert/strict');
const { dateConditions, applyFilters } = require('../utils/crm2LeadFilters');
test('date added ranges include the entire last day and fallback to creation time for legacy leads', () => {
  const [query] = dateConditions({ dateFrom: '2026-10-01', dateTo: '2026-10-28' });
  assert.equal(query.$or[0].dateadded.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(query.$or[0].dateadded.$lt.toISOString(), '2026-10-29T00:00:00.000Z'); assert.equal(query.$or[1].dateadded, null);
  assert.throws(() => dateConditions({ dateFrom: '2026-02-30' }), /valid date/);
  assert.throws(() => dateConditions({ dateFrom: '2026-10-30', dateTo: '2026-10-01' }), /must not/);
});
test('dynamic filters cannot override ownership or use private fields, and dates are not regex queried', () => {
  const query = applyFilters({ colid: 42, counselloremail: 'me@example.com' }, { filters: JSON.stringify([{ field: 'counselloremail', value: 'other@example.com' }, { field: 'dateadded', value: '2026-10-28' }]) });
  assert.equal(query.counselloremail, 'me@example.com'); assert.ok(query.$and[1].dateadded.$gte instanceof Date);
  assert.throws(() => applyFilters({}, { filters: [{ field: 'password', value: 'x' }] }), /Invalid filter/);
  assert.throws(() => applyFilters({}, { filters: [{ field: '$where', value: 'x' }] }), /Invalid filter/);
});
