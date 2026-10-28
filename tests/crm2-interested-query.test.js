const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interestedQuery } = require('../utils/crm2InterestedQuery');
test('program search binds year and program to the same array element', () => {
  const query = interestedQuery(42, { academicyear: '2026-27', programcodes: '["012","013"]', filters: '[{"field":"pipeline","value":"New.*"},{"field":"source","value":"Website"},{"field":"admitted","value":"Yes"}]' });
  assert.equal(query.colid, 42);
  assert.deepEqual(query.programsinterested.$elemMatch, { academicyear: '2026-27', programcode: { $in: ['012','013'] } });
  assert.equal(query.$and[0].pipeline.source, '^New\\.\\*$'); assert.deepEqual(query.$and[2], { admitted: 'Yes' });
  assert.equal(query.academicyear, undefined);
});
test('missing selections, arbitrary filters and malformed input are rejected', () => {
  for (const input of [{}, { academicyear: '2026', programcodes: '[]' }, { academicyear: '2026', programcodes: '["012"]', filters: '[{"field":"colid","value":"1"}]' }]) assert.throws(() => interestedQuery(42, input));
});
