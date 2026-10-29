const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Assessment = require('../Models/assessmentcomponentds');
const User = require('../Models/user');
const Marks = require('../Models/exammodel2componentmarksds');
const Institution = require('../Models/insdetails');
const { addWeightage } = require('../services/studentInternalWeightage');
const { list2, list3 } = require('../controllers/studentinternalmarksctlrds');
const originals = [Assessment.find, User.findOne, Marks.find, Institution.findOne];
afterEach(() => { [Assessment.find, User.findOne, Marks.find, Institution.findOne] = originals; });
const mark = { _id: 'm1', academicyear: '2026-27', regulation: 'R2026', programcode: 'P1', semester: '1', coursecode: 'C1', componenttype: 'Theory', assessmentgroup: 'Tests', assessmentcomponent: 'Test 1', scoretype: 'Internal', approvalstatus: 'Approved', passstatus: 'PASS', marksobtained: 20 };
const chain = rows => ({ select() { return this; }, sort() { return this; }, lean: async () => rows });
test('matches the exact course component and scope and omits Pass/Fail', async () => {
  Assessment.find = query => {
    assert.equal(query.colid, 42); assert.equal(query.scoretype, 'Internal'); assert.equal(query.$or[0].programcode, 'P1'); assert.equal(query.$or[0].coursecode, 'C1');
    return chain([{ ...mark, weightage: 0.25 }, { ...mark, coursecode: 'C2', weightage: 0.9 }, { ...mark, semester: '2', weightage: 0.8 }, { ...mark, assessmentcomponent: 'Other', weightage: 1 }]);
  };
  const [result] = await addWeightage(42, [mark]);
  assert.equal(result.weightage, 0.25); assert.equal(result.passstatus, undefined); assert.equal(result.marksobtained, 20);
});
test('zero weightage is retained and missing/ambiguous mappings do not invent a percentage', async () => {
  Assessment.find = () => chain([{ ...mark, weightage: 0 }]);
  assert.equal((await addWeightage(42, [mark]))[0].weightage, 0);
  Assessment.find = () => chain([]);
  assert.equal((await addWeightage(42, [mark]))[0].weightage, null);
  Assessment.find = () => chain([{ ...mark, weightage: 0.25 }, { ...mark, weightage: 0.5 }]);
  assert.equal((await addWeightage(42, [mark]))[0].weightage, null);
});
test('legacy missing weights default to one and exact semester mappings take priority', async () => {
  Assessment.find = () => chain([{ ...mark, semester: '', weightage: 0.8 }, { ...mark }]);
  assert.equal((await addWeightage(42, [mark]))[0].weightage, 1);
});
test('new endpoint still forces the authenticated student enrollment, approved status and Internal score type', async () => {
  User.findOne = query => { assert.equal(query.colid, 42); assert.equal(query.email, 'ann@example.com'); return chain({ regno: 'R1' }); };
  Marks.find = query => { assert.deepEqual(query, { colid: 42, regno: 'R1', scoretype: 'Internal', approvalstatus: 'Approved' }); return chain([mark]); };
  Assessment.find = () => chain([{ ...mark, weightage: 0.4 }]);
  const res = { status(code) { this.code = code; return this; }, set() {}, json(value) { this.data = value; } };
  await list2({ query: { colid: 42, email: 'ann@example.com', regno: 'OTHER', approvalstatus: 'Pending' } }, res);
  assert.equal(res.data.data[0].weightage, 0.4); assert.equal(res.data.data[0].passstatus, undefined);
});
test('CCE endpoint includes raw marks and configured missing components with scoped institution details', async () => {
  User.findOne = () => chain({ regno: 'R1', name: 'Ann' });
  Marks.find = query => { assert.equal(query.colid, 42); assert.equal(query.regno, 'R1'); assert.equal(query.approvalstatus, 'Approved'); return chain([{ ...mark, rawmarks: 40 }]); };
  Assessment.find = query => { assert.equal(query.colid, 42); assert.equal(query.$or[0].coursecode, 'C1'); assert.equal(query.scoretype, 'Internal'); return chain([{ ...mark, marks: 50, weightage: 0.4 }, { ...mark, assessmentcomponent: 'Project', marks: 20, weightage: 0.5 }]); };
  Institution.findOne = query => { assert.deepEqual(query, { colid: 42 }); return chain({ institutionname: 'College' }); };
  const res = { status(code) { this.code = code; return this; }, set() {}, json(value) { this.data = value; } };
  await list3({ query: { colid: 42, email: 'ann@example.com' } }, res);
  assert.equal(res.data.institution.institutionname, 'College'); assert.equal(res.data.student.regno, 'R1');
  assert.equal(res.data.data[0].rawmarks, 40); assert.equal(res.data.data[0].rawmaxmarks, 50);
  assert.equal(res.data.components.length, 2); assert.equal(res.data.data[0].passstatus, undefined);
});
