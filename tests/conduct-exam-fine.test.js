const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const { calculateExamFine, fineToday } = require('../utils/conductExamFine');
const base = { _id: 'rule1', startdate: '2026-10-01', enddate: '2026-10-31', amount: 10, finetype: 'flat', coursetype: 'overall' };
for (const [finetype, coursetype, expected] of [['flat','overall',10], ['per day','overall',30], ['flat','flat',10], ['flat','per course',30], ['per day','flat',30], ['per day','per course',90]]) test(`${finetype} / ${coursetype}`, () => {
  assert.equal(calculateExamFine([{ ...base, finetype, coursetype }], 3, '2026-10-03').total, expected);
});
test('inclusive boundaries, no courses, outside dates and overlapping ranges', () => {
  assert.equal(calculateExamFine([base], 1, '2026-10-01').total, 10);
  assert.equal(calculateExamFine([base], 1, '2026-10-31').total, 10);
  assert.equal(calculateExamFine([base], 1, '2026-11-01').total, 0);
  assert.equal(calculateExamFine([base], 1, '2026-09-30').total, 0);
  assert.equal(calculateExamFine([base], 0, '2026-10-03').total, 0);
  assert.equal(calculateExamFine([base, { ...base, amount: 0.65, finetype: 'per day' }], 2, '2026-10-03').total, 11.95);
  assert.equal(fineToday('2026-10-28T19:00:00Z'), '2026-10-29');
});
test('browser calculation stays identical to server calculation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../ep3-main/src/utils/conductExamFine.js'), 'utf8').replace(/export /g, '');
  const context = {}; vm.runInNewContext(source, context);
  for (const finetype of ['flat','per day']) for (const coursetype of ['overall','flat','per course']) {
    const rules = [{ ...base, finetype, coursetype }];
    assert.equal(JSON.stringify(context.calculateExamFine(rules, 4, '2026-10-12')), JSON.stringify(calculateExamFine(rules, 4, '2026-10-12')));
  }
});
function fixture({ scholarship = false, maxfees = 50 } = {}) {
  const file = path.join(__dirname, '../controllers/conductexamformctlrds.js'), actual = createRequire(file);
  const queries = [], ledger = [], submissions = [];
  const chain = value => ({ lean: async () => value, sort() { return this; }, select() { return this; } });
  const student = { name: 'Ann', colid: 42, regno: 'R1', email: 'ann@example.com', program: 'Science', programcode: 'P1', regulation: 'R2026', semester: '1' };
  const generic = { find: () => chain([]), findOne: () => chain(null), findOneAndUpdate: async () => null };
  const models = {
    user: { findOne: () => chain(student) },
    conductexamformds: { findOne: () => chain({ formid: 'FORM', academicyear: '2026-27', tabs: [], documents: [] }) },
    conductexamds: { findOne: () => chain({ examname: 'Final' }) },
    conductexamscholarshipds: { findOne: () => chain(scholarship ? { note: 'Waived' } : null) },
    conductexamexamfeemaxds: { findOne: () => chain({ maxfees }) },
    conductexamfineds: { find: query => { queries.push(query); return chain([{ ...base, startdate: fineToday(), enddate: fineToday(), finetype: 'per day', coursetype: 'per course' }]); } },
    conductexamformsubmissionds: { create: async value => { submissions.push(value); return { ...value, _id: 'submission1' }; } },
    ledgerstud: { ...generic, findOneAndUpdate: async (_, value) => { ledger.push(value); return value; } }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require(name) { return name.startsWith('../Models/') ? models[name.split('/').at(-1)] || generic : actual(name); }, Buffer, console });
  const submit = async (fine = true) => {
    let status = 200, result;
    await module.exports.submitStudentExamForm({ programwiseExamFine: fine, body: { colid: 42, regno: 'R1', formid: 'FORM', academicyear: '2026-27', examcode: 'EX1', examtype: 'Regular', fineamount: 0, courses: [{ coursecode: 'C1', fee: 100 }, { coursecode: 'C2', fee: 100 }] } }, { status(value) { status = value; return this; }, json(value) { result = value; } });
    return { status, result };
  };
  return { submit, queries, ledger, submissions };
}
test('submission recalculates fines from scoped rules, adds after cap, persists same ledger balance', async () => {
  const f = fixture(); const { status, result } = await f.submit();
  assert.equal(status, 200); assert.equal(result.totalfee, 70); assert.equal(result.fineamount, 20);
  assert.equal(f.ledger[0].amount, 70); assert.equal(f.ledger[0].balance, 70);
  assert.equal(f.submissions[0].fineamount, 20); assert.equal(f.submissions[0].finerules.length, 1);
  assert.equal(JSON.stringify(f.queries[0]), JSON.stringify({ colid: 42, academicyear: '2026-27', examcode: 'EX1', program: 'Science', programcode: 'P1' }));
});
test('original forms do not accrue new fines; scholarships retain zero ledger behavior', async () => {
  const original = fixture(); const legacy = await original.submit(false);
  assert.equal(legacy.status, 200); assert.equal(legacy.result.totalfee, 50); assert.equal(original.queries.length, 0);
  const waived = fixture({ scholarship: true }); const result = await waived.submit();
  assert.equal(result.status, 200); assert.equal(result.result.totalfee, 0); assert.equal(waived.ledger.length, 0);
});
function crudFixture() {
  const writes = [], queries = [];
  const file = path.join(__dirname, '../controllers/conductexamfinectlrds.js');
  const chain = value => ({ lean: async () => value, sort() { return this; }, select() { return this; } });
  const fine = { create: async value => { writes.push(value); return value; }, findOneAndUpdate: async (query, value) => { queries.push(query); writes.push(value.$set); return value.$set; }, deleteMany: async query => { queries.push(query); return { deletedCount: 2 }; }, find: query => { queries.push(query); return chain([]); } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require(name) {
    if (name.endsWith('conductexamfineds')) return fine;
    return { findOne: query => { queries.push(query); return chain(name.endsWith('conductexamds') ? { examname: 'Canonical exam' } : { program: 'Canonical program' }); } };
  } });
  const invoke = async (action, body, query = {}) => {
    let status = 200, data;
    await module.exports[action]({ body, query }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  };
  return { writes, queries, invoke };
}
const fineInput = { ...base, colid: 42, academicyear: '2026-27', examcode: 'EX1', programcode: 'P1', exam: 'Spoof', program: 'Spoof' };
test('fine CRUD uses canonical masters and scopes updates, filters and bulk deletion', async () => {
  const f = crudFixture();
  assert.equal((await f.invoke('save', { ...fineInput, id: 'fine1' })).status, 200);
  assert.equal(f.writes[0].program, 'Canonical program'); assert.equal(f.writes[0].exam, 'Canonical exam');
  assert.equal(f.queries.at(-1).colid, 42);
  assert.equal((await f.invoke('remove', { colid: 42, ids: ['fine1','fine2'] })).status, 200);
  assert.equal(f.queries.at(-1).colid, 42);
  await f.invoke('list', {}, { colid: 42, filters: JSON.stringify([{ field: 'colid', value: 99 }, { field: 'programcode', value: 'P1' }]) });
  assert.equal(f.queries.at(-1).colid, 42); assert.equal(f.queries.at(-1).programcode, 'P1');
});
test('fine rules reject reversed/invalid dates and negative amounts; bulk ignores row colid', async () => {
  const f = crudFixture();
  for (const value of [{ startdate: '2026-11-02', enddate: '2026-11-01' }, { startdate: '2026-02-30' }, { amount: -1 }]) assert.equal((await f.invoke('save', { ...fineInput, ...value })).status, 400);
  const bulk = await f.invoke('bulk', { colid: 42, rows: [{ ...fineInput, colid: 99 }] });
  assert.equal(bulk.status, 200); assert.equal(bulk.data.saved, 1); assert.equal(f.writes[0].colid, 42);
});
