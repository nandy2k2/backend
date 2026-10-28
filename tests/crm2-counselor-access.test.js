const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
test('counselor dashboard access is upserted for the exact institution and role, leaving other permissions alone', async () => {
  const calls = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/crm2CounselorAccess.js'), 'utf8'), { module, require: () => ({ updateOne: async (...args) => calls.push(args) }) });
  await module.exports({ colid: 42, role: 'counselor', email: 'me@example.com' });
  assert.equal(calls[0][0].colid, 42); assert.equal(calls[0][0].role, 'counselor'); assert.equal(calls[0][0].path, '/counsellor-dashboard');
  assert.equal(calls[0][1].$set.access, 'Allow'); assert.equal(calls[0][2].upsert, true);
  await module.exports({ colid: 42, role: 'Student' }); assert.equal(calls.length, 1);
  await module.exports({ colid: 42, role: 'telecaller', email: 'tele@example.com' });
  assert.equal(calls[1][0].path, '/telecaller-dashboard'); assert.equal(calls[1][0].role, 'telecaller');
});
test('year filter includes only truly undated legacy records in addition to matching years', () => {
  const { yearScope } = require('../utils/crm2DashboardScope');
  const legacy = yearScope('2026-27').$or[2].$and;
  assert.deepEqual(legacy[0].academicyear.$in, [null, '']);
  assert.deepEqual(legacy[1].programsinterested.$not.$elemMatch.academicyear.$nin, [null, '']);
});
