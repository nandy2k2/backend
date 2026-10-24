const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup() {
  const calls = [], module = { exports: {} };
  const model = {
    async create(data) { calls.push({ data }); return data; },
    async findOneAndUpdate(query, data) { calls.push({ query, data }); return data; },
    async insertMany(data) { calls.push({ data }); return data; },
    find(query) { calls.push({ query }); return { sort() { return this; }, lean: async () => [] }; },
    async distinct(field, query) { calls.push({ field, query }); return field === 'programgroup' ? ['Science'] : []; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/mprogramsmanagementctlrds.js'), 'utf8'), { module, exports: module.exports, require: () => model });
  const call = async (method, data) => { let status = 200, body; await module.exports[method]({ body: data, query: data }, { status(value) { status = value; return this; }, json(value) { body = value; } }); return { status, body }; };
  return { call, calls };
}
const row = { colid: 42, user: 'admin@example.com', program: 'BSc', programcode: 'P1', programgroup: ' Science ' };
test('programgroup is saved and trimmed in create and edit', async () => {
  const { call, calls } = setup();
  assert.equal((await call('createProgram', row)).status, 200);
  await call('updateProgram', { ...row, id: 'p1', programgroup: 'Arts' });
  assert.equal(calls[0].data.programgroup, 'Science'); assert.equal(calls[1].data.programgroup, 'Arts'); assert.equal(calls[1].query.colid, 42);
});
test('bulk upload accepts canonical and readable program group headers', async () => {
  const { call, calls } = setup();
  const result = await call('bulkPrograms', { colid: 42, user: row.user, rows: [row, { ...row, programgroup: undefined, 'Program Group': 'Commerce' }] });
  assert.equal(result.body.inserted, 2); assert.equal(calls[0].data[0].programgroup, 'Science'); assert.equal(calls[0].data[1].programgroup, 'Commerce');
});
test('group options and filters remain institution scoped', async () => {
  const { call, calls } = setup();
  const response = await call('getProgramOptions', { colid: 42 });
  assert.equal(response.body.programgroups[0], 'Science');
  await call('getPrograms', { colid: 42, programgroup: 'Science' });
  assert.ok(calls.every(call => call.query.colid === 42)); assert.equal(calls.at(-1).query.programgroup, 'Science');
});
