const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup({ total = 37, exportCount = 1 } = {}) {
  const calls = [], module = { exports: {} };
  const facets = { total: [{ count: total }], unique: [{ count: 35 }], pipeline: [{ _id: 'Interested', count: total }], category: [{ _id: 'OBC', count: total }], source: [{ _id: 'Website', count: total }], case: [{ _id: 'Callback', count: total }], data: Array.from({ length: exportCount }, (_, i) => ({ _id: `assignment${i}`, academicyear: '2026-27', programcode: 'P1', program: 'Old name', pipeline: 'Interested', lead: { _id: `lead${i}`, name: 'Applicant', academicyear: '2025-26', password: 'secret', emailkey: 'private', regno: 'hidden', email: 'lead@example.com', category: 'OBC' } })) };
  const deps = {
    '../Models/crm2programds': { Assignment: { aggregate: async pipeline => { calls.push({ pipeline }); return pipeline.some(stage => stage.$facet) ? [facets] : [{ _id: 'Interested' }]; }, countDocuments: async query => { calls.push({ legacy: query }); return 2; } } },
    '../Models/crm2ds': { Lead: { collection: { name: 'crm2leadds' } }, fields: [{ field: 'name', type: 'String' }, { field: 'category', type: 'String' }, { field: 'annualincome', type: 'Number' }, { field: 'campusvisitdate', type: 'Date' }, { field: 'password', type: 'String' }], excluded: new Set(['regno', '_id']) },
    '../Models/mprograms': { findOne(query) { calls.push({ program: query }); return { select() { return this; }, lean: async () => ({ program: 'Science', programcode: 'P1', year: '2026-27' }) }; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/crm2programreportctlrds.js'), 'utf8'), { module, exports: module.exports, require: name => deps[name] });
  const call = async (method, query) => { let body; try { await module.exports[method]({ colid: 42, query }, { json: value => { body = value; } }); return { body, status: 200 }; } catch (error) { return { status: error.status || 500, message: error.message }; } };
  return { call, calls };
}
const selection = { academicyear: '2026-27', programcode: 'P1' };
test('report requires year/program, enforces colid on allocation and lead join, and summarizes the full filtered set', async () => {
  const { call, calls } = setup();
  assert.equal((await call('report', {})).status, 400);
  const result = await call('report', { ...selection, filters: JSON.stringify([{ field: 'pipeline', value: 'Interested' }, { field: 'source', value: 'Website' }]), skip: 25, limit: 25 });
  assert.equal(result.status, 200); assert.equal(result.body.total, 37); assert.equal(result.body.uniqueLeads, 35); assert.equal(result.body.summary.category[0].count, 37);
  assert.equal(calls[0].program.year, selection.academicyear); assert.equal(calls[0].program.colid, 42);
  const stages = calls.find(call => call.pipeline).pipeline;
  assert.equal(stages[0].$match.colid, 42); assert.equal(stages[0].$match.academicyear, selection.academicyear);
  assert.equal(stages[1].$lookup.pipeline[0].$match.colid, 42);
  const filters = stages.find(stage => stage.$match?.$and).$match.$and;
  assert.ok(filters[0].pipeline); assert.ok(filters[1]['lead.source']);
  const facet = stages.find(stage => stage.$facet).$facet;
  assert.equal(facet.data[1].$skip, 25); assert.equal(facet.pipeline[0].$group.count.$sum, 1);
  assert.equal(result.body.data[0].academicyear, '2026-27'); assert.equal(result.body.data[0].leadacademicyear, '2025-26');
  assert.equal(result.body.data[0].program, 'Science'); assert.equal(result.body.data[0].password, undefined); assert.equal(result.body.data[0].emailkey, undefined); assert.equal(result.body.data[0].regno, undefined);
  assert.equal(result.body.legacy, 2);
});
test('options only include valid public fields and use the same year/program scope', async () => {
  const { call, calls } = setup();
  const metadata = await call('options', {});
  assert.ok(metadata.body.fields.some(row => row.field === 'pipeline'));
  assert.ok(!metadata.body.fields.some(row => row.field === 'password'));
  assert.equal((await call('options', { ...selection, field: 'password' })).status, 400);
  const response = await call('options', { ...selection, field: 'pipeline' });
  assert.equal(response.body.data[0], 'Interested');
  assert.equal(calls.find(call => call.pipeline).pipeline[0].$match.programcode, 'P1');
});
test('invalid dates, numbers, and unsupported filters are rejected', async () => {
  const { call } = setup();
  for (const filter of [{ field: 'password', value: 'x' }, { field: 'campusvisitdate', value: 'bad' }, { field: 'annualincome', value: 'bad' }]) {
    assert.equal((await call('report', { ...selection, filters: JSON.stringify([filter]) })).status, 400);
  }
});
test('export uses all matching records rather than the grid page and prevents silent truncation', async () => {
  const { call, calls } = setup();
  assert.equal((await call('report', { ...selection, export: 'true', skip: 50 })).status, 200);
  const facet = calls.find(call => call.pipeline).pipeline.find(stage => stage.$facet).$facet;
  assert.equal(facet.data[1].$skip, 0); assert.equal(facet.data[2].$limit, 10001);
  assert.equal((await setup({ exportCount: 10001 }).call('report', { ...selection, export: 'true' })).status, 400);
});
test('academic year index is installed before the obsolete unique index is removed', async () => {
  const module = { exports: {} }, calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/crm2ProgramYearIndex.js'), 'utf8'), { module });
  const collection = { createIndex: async (keys, options) => { calls.push({ keys, options }); }, dropIndex: async name => { calls.push(name); } };
  await module.exports(collection); await module.exports(collection);
  assert.equal(calls.length, 2); assert.equal(calls[0].keys.academicyear, 1); assert.equal(calls[0].options.unique, true); assert.equal(calls[1], 'colid_1_leadid_1_programcode_1');
});
