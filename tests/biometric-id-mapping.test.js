const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const file = path.join(__dirname, '../controllers/biometricidmappingctlrds.js'), realRequire = require('node:module').createRequire(file);
const id = '507f1f77bcf86cd799439011';
function fixture({ user = { biometricid: '00012' }, matched = 1 } = {}) {
  const queries = [], writes = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
  const User = {
    findOne(query) { queries.push(query); return chain(user); },
    find(query) { queries.push(query); return chain([{ _id: id, name: 'User', email: 'user@example.com', biometricid: '00012' }]); },
    async countDocuments(query) { queries.push(query); return 1; },
    async aggregate(stages) { queries.push(stages[0].$match); return [{ _id: typeof stages[1].$group._id === 'string' ? 'Faculty' : { program: 'BSc', programcode: 'P1' } }]; },
    async updateOne(query, update) { writes.push({ query, update }); return { matchedCount: matched }; }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: name => name === '../Models/user' ? User : realRequire(name) });
  const call = async (route, body = {}, query = {}) => { let status = 200, data; await module.exports.stack.find(layer => layer.route?.path === route).route.stack[0].handle({ body, query }, { status(value) { status = value; return this; }, json(value) { data = value; } }); return { status, data }; };
  return { queries, writes, call };
}
test('options and users are institution scoped, use dynamic role filters, and do not force a Student role', async () => {
  const f = fixture();
  assert.equal((await f.call('/options', {}, { colid: 42 })).data.fields[0], 'role');
  await f.call('/options', {}, { colid: 42, field: 'role', search: 'Fac' });
  assert.equal((await f.call('/users', { colid: 42, filters: [{ field: 'role', value: ['Faculty'] }] })).data.data[0].biometricid, '00012');
  assert.ok(f.queries.every(query => query.colid === 42));
  const query = f.queries.find(query => query.$and);
  assert.equal(query.role, undefined); assert.equal(query.$and[0].role.$in[0], 'Faculty');
});
test('only biometricid is written, keeping leading zeros and scoping by user ID and colid', async () => {
  const f = fixture();
  const result = await f.call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: '00012', value: '00034', regno: 'HACK' }] });
  assert.equal(result.data.saved, 1); assert.equal(f.writes[0].query.colid, 42); assert.equal(f.writes[0].query._id, id); assert.equal(f.writes[0].query.biometricid, '00012');
  assert.deepEqual(Object.keys(f.writes[0].update.$set), ['biometricid']); assert.equal(f.writes[0].update.$set.biometricid, '00034');
});
test('missing and blank biometric IDs can be populated and existing IDs can be cleared', async () => {
  const missing = fixture({ user: {} });
  assert.equal((await missing.call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: '', value: '00001' }] })).data.saved, 1);
  assert.equal(missing.writes[0].query.$or.length, 3);
  const clear = fixture();
  assert.equal((await clear.call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: '00012', value: '' }] })).data.saved, 1);
});
test('unchanged and stale values are not overwritten; foreign users and simultaneous changes are rejected', async () => {
  const f = fixture();
  assert.equal((await f.call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: '00012', value: '00012' }] })).data.results[0].status, 'unchanged');
  assert.equal((await f.call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: 'OLD', value: 'NEW' }] })).data.saved, 0);
  assert.equal(f.writes.length, 0);
  assert.equal((await fixture({ user: null }).call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: '', value: 'NEW' }] })).data.saved, 0);
  assert.equal((await fixture({ matched: 0 }).call('/save', { colid: 42, field: 'biometricid', rows: [{ id, oldvalue: '00012', value: 'NEW' }] })).data.saved, 0);
});
test('rejects missing institution, absent filters, invalid fields, and oversized updates', async () => {
  const f = fixture();
  assert.equal((await f.call('/options')).status, 400);
  assert.equal((await f.call('/options', {}, { colid: 42, field: 'password' })).status, 400);
  assert.equal((await f.call('/users', { colid: 42, filters: [] })).status, 400);
  assert.equal((await f.call('/save', { colid: 42, field: 'regno', rows: [{ id, value: 'NEW' }] })).status, 400);
  assert.equal((await f.call('/save', { colid: 42, field: 'biometricid', rows: [{ id, value: 'x'.repeat(201) }] })).status, 400);
  assert.equal(f.writes.length, 0);
});
