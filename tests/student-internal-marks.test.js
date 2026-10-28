const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../Models/user');
const Marks = require('../Models/exammodel2componentmarksds');
const { list } = require('../controllers/studentinternalmarksctlrds');
const originalUser = User.findOne, originalMarks = Marks.find;
afterEach(() => { User.findOne = originalUser; Marks.find = originalMarks; });
const response = () => ({ code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
test('server forces approved Internal marks for the student enrollment and institution', async () => {
  User.findOne = filter => { assert.deepEqual(filter, { colid: 42, email: 'student@example.com', role: 'Student' }); return { select: () => ({ lean: async () => ({ regno: 'REAL' }) }) }; };
  Marks.find = filter => {
    assert.deepEqual(filter, { colid: 42, regno: 'REAL', scoretype: 'Internal', approvalstatus: 'Approved' });
    return { select: () => ({ sort: () => ({ lean: async () => [{ marksobtained: 18 }] }) }) };
  };
  const res = response();
  await list({ query: { colid: 42, email: 'student@example.com', regno: 'OTHER', approvalstatus: 'Pending', scoretype: 'External' } }, res);
  assert.equal(res.code, 200); assert.equal(res.data.data[0].marksobtained, 18);
});
test('missing session is rejected without fetching marks', async () => {
  Marks.find = () => { throw new Error('Should not query marks'); };
  const res = response(); await list({ query: {} }, res); assert.equal(res.code, 400);
});
test('nonstudent or missing enrollment is rejected', async () => {
  User.findOne = () => ({ select: () => ({ lean: async () => null }) });
  const res = response(); await list({ query: { colid: 42, email: 'user@example.com' } }, res); assert.equal(res.code, 403);
});
