const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup(people = [{ name: 'Faculty Name', email: 'faculty@example.com' }]) {
  const calls = [], module = { exports: {} };
  const model = {
    async create(data) { calls.push({ model: 'program', data }); return data; },
    async findOneAndUpdate(query, data) { calls.push({ model: 'program', query, data }); return data; },
    async insertMany(data) { calls.push({ model: 'program', data }); return data; }
  };
  const User = { find(query) { calls.push({ model: 'user', query }); return { select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => people }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/mprogramsmanagementctlrds.js'), 'utf8'), { module, exports: module.exports, require: name => name.endsWith('/user') ? User : model });
  const call = async (method, input) => { let status = 200, data; await module.exports[method]({ body: input, query: input }, { status(value) { status = value; return this; }, json(value) { data = value; } }); return { status, data }; };
  return { call, calls };
}
const row = { colid: 42, user: 'admin@example.com', program: 'BSc', programcode: 'P1' };
const extra = { enrollmentcode: 'ENR', displayname: 'B.Sc.', marksheetname: 'Bachelor of Science', branchcode: 'SCI', programlevelcode: 'UG', gender: 'All', coursetype: 'Online', coursetime: 'Parttime', shift: 'Evening', programincharge: 'Forged Name', programinchargeemail: 'faculty@example.com', semestertype: 'Trimester', noofsemesters: '9', noofyears: '3', maxallowedyear: '6' };
test('all additional fields persist and incharge name/email are verified against the institution User', async () => {
  const { call, calls } = setup();
  const result = await call('createProgram', { ...row, ...extra });
  assert.equal(result.status, 200);
  const data = calls.find(call => call.model === 'program').data;
  for (const field of Object.keys(extra).filter(field => !['programincharge', 'noofsemesters', 'noofyears', 'maxallowedyear'].includes(field))) assert.equal(data[field], extra[field]);
  assert.equal(data.programincharge, 'Faculty Name'); assert.equal(data.noofsemesters, 9); assert.equal(data.noofyears, 3); assert.equal(data.maxallowedyear, 6);
  assert.equal(calls[0].query.colid, 42);
});
test('editing and bulk upload support readable headers and keep invalid rows out', async () => {
  const { call, calls } = setup();
  const edit = await call('updateProgram', { ...row, id: 'p1', 'Enrollment Code': 'E1', Shift: 'Morning', 'Program incharge email': 'faculty@example.com', 'No of years': 1.5 });
  assert.equal(edit.status, 200); assert.equal(edit.data.data.enrollmentcode, 'E1'); assert.equal(edit.data.data.noofyears, 1.5);
  assert.equal(calls.find(call => call.model === 'program').query.colid, 42);
  const bulk = await call('bulkPrograms', { colid: 42, user: row.user, rows: [{ ...row, ...extra }, { ...row, gender: 'Invalid' }] });
  assert.equal(bulk.data.inserted, 1); assert.equal(bulk.data.errors[0].row, 3);
});
test('invalid enumerations, negative numbers and fractional semesters are rejected', async () => {
  for (const invalid of [{ gender: 'Other' }, { coursetype: 'Invalid' }, { coursetime: 'Invalid' }, { semestertype: 'Invalid' }, { noofsemesters: 1.5 }, { noofyears: -1 }, { maxallowedyear: 'NaN' }]) {
    const { call, calls } = setup();
    assert.equal((await call('createProgram', { ...row, ...invalid })).status, 400);
    assert.equal(calls.filter(call => call.model === 'program').length, 0);
  }
});
test('omitted fields stay omitted for older API callers; incharge can be cleared explicitly', async () => {
  const { call } = setup();
  const old = await call('updateProgram', { ...row, id: 'p1' });
  assert.equal(old.data.data.semestertype, undefined); assert.equal(old.data.data.noofyears, undefined); assert.equal(old.data.data.programincharge, undefined);
  const cleared = await call('updateProgram', { ...row, id: 'p1', programincharge: '', programinchargeemail: '', noofyears: '' });
  assert.equal(cleared.data.data.programinchargeemail, ''); assert.equal(cleared.data.data.noofyears, null);
});
test('incharge dropdown searches only within colid, and foreign/ambiguous users cannot be assigned', async () => {
  const { call, calls } = setup();
  await call('getProgramIncharges', { colid: 42, search: 'faculty' });
  assert.equal(calls[0].query.colid, 42); assert.ok(calls[0].query.$or[1].email.test('faculty@example.com'));
  assert.equal((await setup([]).call('createProgram', { ...row, ...extra })).status, 400);
  assert.equal((await setup([{ name: 'Same', email: 'one@example.com' }, { name: 'Same', email: 'two@example.com' }]).call('createProgram', { ...row, programincharge: 'Same' })).status, 400);
});
