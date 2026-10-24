const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const file = path.join(__dirname, '../controllers/studentdatauploadctlrds.js');
function setup() {
  const writes = [], module = { exports: {} };
  const user = {
    exists: async () => false,
    findOne(query) { return query._id ? null : { select() { return this; }, lean: async () => ({ _id: 'student1', regno: 'R1' }) }; },
    async create(payload) { writes.push({ payload }); return payload; },
    async findOneAndUpdate(query, payload) { writes.push({ query, payload }); return payload; }
  };
  const multer = () => ({ single: () => () => {} }); multer.memoryStorage = () => ({});
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nexports.testFields = fields;', { module, exports: module.exports, require: name => name === '../Models/user' ? user : name === 'multer' ? multer : name.startsWith('../Models/') || ['aws-sdk', 'mongoose'].includes(name) ? {} : require(name) });
  const call = async (method, body) => { let status = 200, data; await module.exports[method]({ body }, { status(value) { status = value; return this; }, json(value) { data = value; } }); return { status, data }; };
  return { call, writes, fields: module.exports.testFields };
}
const student = { colid: 42, name: 'Student', email: 'student@example.com', regno: 'R1', scholarnumber: 'S1' };
test('dob is supported by the student standard fields and saved on creation', async () => {
  const { call, writes, fields } = setup();
  assert.ok(fields.includes('dob'));
  const result = await call('createStudent', { ...student, dob: '2004-09-18' });
  assert.equal(result.status, 200); assert.equal(writes[0].payload.dob, '2004-09-18'); assert.equal(result.data.dob, '2004-09-18');
});
test('editing saves dob using the existing institution and Student scope', async () => {
  const { call, writes } = setup();
  const result = await call('updateStudent', { ...student, id: 'student1', dob: '2005-02-12' });
  assert.equal(result.status, 200); assert.equal(writes[0].query.colid, 42); assert.equal(writes[0].query.role, 'Student'); assert.equal(writes[0].payload.dob, '2005-02-12');
});
test('bulk upload accepts dob and date-of-birth aliases without changing birthdate model', async () => {
  const { call, writes } = setup();
  const result = await call('bulkStudents', { colid: 42, items: [{ ...student, 'Date of Birth': '2004-09-18' }, { ...student, dob: '2005-01-01' }] });
  assert.equal(result.data.saved, 2); assert.equal(writes[0].payload.dob, '2004-09-18'); assert.equal(writes[1].payload.dob, '2005-01-01');
  assert.equal(writes[0].payload.birthdate, undefined);
});
