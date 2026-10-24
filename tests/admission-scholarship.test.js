const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const file = path.join(__dirname, '../controllers/admissionscholarshipctlrds.js');
const requireReal = require('node:module').createRequire(file);
const id = '111111111111111111111111';
function fixture() {
  const queries = [], writes = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
  const Model = {
    find: query => { queries.push(query); return chain([]); },
    insertMany: async rows => { writes.push(...rows); },
    findOneAndUpdate: async (query, update) => { queries.push(query); writes.push(update.$set); return update.$set; },
    deleteMany: async query => { queries.push(query); return { deletedCount: 1 }; }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: name => name === '../Models/admissionscholarshipds' ? Model : name === '../Models/mprograms' ? { findOne: query => { queries.push(query); return chain(query.programcode === 'INVALID' ? null : { program: 'Master program', programcode: query.programcode }); } } : requireReal(name) });
  const call = async (route, body = {}, query = {}, method = 'post') => {
    let status = 200, data;
    await module.exports.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack[0].handle({ body, query }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  };
  return { call, queries, writes };
}
const row = { scholarship: 'Merit', programcode: 'P1', value: 25, type: 'Percentage', merit: 'Yes', meritpercentage: 80 };
test('creates one validated record per program and derives names from scoped master', async () => {
  const f = fixture(); const result = await f.call('/save', { colid: 42, rows: [row, { ...row, programcode: 'P2', program: 'forged' }] });
  assert.equal(result.status, 200); assert.equal(result.data.saved, 2);
  assert.equal(f.writes[1].program, 'Master program'); assert.ok(f.writes.every(item => item.colid === 42));
});
test('validates all rows before insert, rejects bad percentages and enum values', async () => {
  for (const change of [{ value: 101 }, { value: -1 }, { meritpercentage: 101 }, { type: 'Other' }, { category: 'Other' }, { active: 'Other' }, { gender: 'Other' }, { programcode: 'INVALID' }]) {
    const f = fixture(); assert.equal((await f.call('/save', { colid: 42, rows: [row, { ...row, ...change }] })).status, 400); assert.equal(f.writes.length, 0);
  }
});
test('search, editing, and bulk deletion are institution scoped', async () => {
  const f = fixture();
  await f.call('/', {}, { colid: 42, search: 'Merit.*' }, 'get');
  assert.equal(f.queries[0].colid, 42); assert.equal(f.queries[0].$or[0].scholarship.source, 'Merit\\.\\*');
  await f.call('/save', { colid: 42, id, rows: [row] });
  await f.call('/delete', { colid: 42, ids: [id] });
  assert.ok(f.queries.every(query => query.colid === 42));
  assert.equal((await f.call('/save', { colid: 42, id, rows: [row, row] })).status, 400);
});
test('schema stores all fields and enforces Yes/No admitted on CRM lead', () => {
  const Model = require('../Models/admissionscholarshipds');
  const doc = new Model({ colid: 42, ...row, program: 'Science' });
  assert.equal(doc.validateSync(), undefined); assert.equal(doc.category, 'All'); assert.equal(doc.active, 'Yes');
  const { Lead, fields } = require('../Models/crm2ds');
  assert.equal(Lead.schema.path('admitted').defaultValue, 'No');
  assert.deepEqual([...Lead.schema.path('admitted').enumValues], ['Yes', 'No']);
  assert.equal(fields.find(field => field.field === 'admitted').group, 'CRM Details');
});
