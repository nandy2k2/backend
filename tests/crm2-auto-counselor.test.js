const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findAutoCounselor } = require('../utils/crm2AutoCounselor');
function setup(byProgram, valid = true) {
  const queries = [];
  return { queries, Mapping: { find(query) { queries.push(query); return { sort() { return this; }, lean: async () => byProgram[query.programcode] || [] }; } }, User: { findOne(query) { queries.push(query); return { select() { return this; }, lean: async () => valid ? { name: 'Real counselor', email: 'person@example.com' } : null }; } } };
}
const lead = { country: 'India', state: 'Gujarat', city: 'Ahmedabad', programsinterested: [{ programcode: 'P2', priority: 2 }, { programcode: 'P1', priority: 1 }] };
test('first priority is tried first, then next priority with exact scoped address', async () => {
  const f = setup({ P2: [{ counselloremail: 'person@example.com' }] });
  assert.deepEqual(await findAutoCounselor(f, 42, lead), { counsellorname: 'Real counselor', counselloremail: 'person@example.com' });
  assert.equal(f.queries[0].programcode, 'P1'); assert.equal(f.queries[1].programcode, 'P2');
  assert.equal(f.queries[0].colid, 42); assert.equal(f.queries[0].city.source, '^Ahmedabad$'); assert.equal(f.queries[0].state.source, '^Gujarat$');
});
test('matching priority one stops searching and uses User name/email', async () => {
  const f = setup({ P1: [{ counselloremail: 'person@example.com', counsellorname: 'Stale' }], P2: [{ counselloremail: 'other@example.com' }] });
  const result = await findAutoCounselor(f, 42, lead);
  assert.equal(result.counsellorname, 'Real counselor'); assert.equal(f.queries.filter(query => query.programcode).length, 1);
});
test('missing address, absent mappings or missing counselor return no match', async () => {
  assert.equal(await findAutoCounselor(setup({}), 42, lead), null);
  assert.equal(await findAutoCounselor(setup({ P1: [{ counselloremail: 'deleted@example.com' }] }, false), 42, lead), null);
  const f = setup({}); assert.equal(await findAutoCounselor(f, 42, { ...lead, city: '' }), null); assert.equal(f.queries.length, 0);
});
test('mapping index migration creates location-aware unique index before dropping only old index', async () => {
  const ensure = require('../utils/crm2MappingAddressIndex'); const calls = [];
  const collection = { createIndex: async (keys, options) => { calls.push('create'); assert.equal(keys.city, 1); assert.equal(options.unique, true); }, dropIndex: async name => { calls.push('drop'); assert.equal(name, 'colid_1_programcode_1_counselloremail_1_location_1'); } };
  await ensure(collection); await ensure(collection); assert.deepEqual(calls, ['create','drop']);
});
