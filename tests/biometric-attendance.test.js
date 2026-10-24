const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const file = path.join(__dirname, '../services/biometricAttendance.js');
const realRequire = require('node:module').createRequire(file);
function fixture(exempt = '', salary = true) {
  const writes = [], queries = [], stored = new Map(), payroll = new Map(), ledgers = new Map();
  let count = 0;
  const chain = value => ({ select() { return this; }, limit() { return this; }, session() { return this; }, lean: async () => value, then(resolve) { resolve(value); } });
  const model = (name, values = []) => ({
    find(query) { queries.push({ name, query }); return chain(values); },
    findOne(query) { queries.push({ name, query }); return chain(name === 'Leave' && ['leave', 'comp'].includes(exempt) ? { leavetype: exempt === 'comp' ? 'Compensatory Leave' : 'Casual Leave' } : name === 'Holiday' && exempt === 'holiday' ? {} : null); }
  });
  class Attendance {
    static async init() {}
    constructor() { this._id = `attendance${++count}`; }
    toObject() { return { ...this }; }
    async save() { stored.set(String(this.userid) + this.date, this); }
    static findOne(query) { queries.push({ name: 'Attendance', query }); return chain(query._id ? [...stored.values()].find(row => row._id === query._id) : stored.get(String(query.userid) + query.date) || null); }
    static deleteOne(query) { for (const [key, row] of stored) if (row._id === query._id) stored.delete(key); return chain({}); }
  }
  const earnings = salary ? [{ amount: 30000, type: 'Credit', structure: 'Monthly' }, { amount: 3000, type: 'Deduction' }] : [];
  const Salary = model('Salary', earnings);
  Salary.findOne = query => chain(payroll.get(String(query._id)) || null);
  Salary.updateOne = async (query, update) => { writes.push({ name: 'Salary', query, update }); payroll.set(String(query._id), { ...update.$set }); };
  Salary.deleteOne = query => { payroll.delete(String(query._id)); return chain({}); };
  const Ledger = { updateOne: async (query, update) => { writes.push({ name: 'Ledger', query, update }); ledgers.set(String(query._id), update.$set); }, deleteOne: query => { ledgers.delete(String(query._id)); return chain({}); } };
  const mocks = { user: model('User', [{ _id: 'user1', email: 'faculty@test.com', name: 'Faculty', role: 'Faculty' }]), hrbiometricattendanceds: Attendance,
    hrleaveapplicationds: model('Leave'), hrleaveweeklyoffds: model('Weekly', exempt === 'weekly' ? [{ type: 'every', dayofweek: 'Monday' }] : []),
    hrleaveholidaylistds: model('Holiday'), macadcal: model('Calendar'), hrleavecompensatoryruleds: model('CompRule'), hrsalary: Salary,
    hrsalstructure: model('Structure', earnings), employeeledgernewds: Ledger };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, Date, console, require: name => name === 'mongoose' ? { Types: { ObjectId: class { constructor() { this.id = ++count; } toString() { return `id${this.id}`; } } }, startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) } : name.startsWith('../Models/') ? mocks[name.split('/').pop()] : realRequire(name) });
  return { ...module.exports, writes, queries, payroll, ledgers, stored, mocks };
}
const input = { academicyear: '2026-27', biometricid: '00012', date: '2026-10-19', attendance: 0 };
test('normalizes IDs, present/absent, calendar year and month; rejects invalid dates, attendance and times', () => {
  const f = fixture(); const row = f.normalize(input);
  assert.equal(row.biometricid, '00012'); assert.equal(row.month, 'October'); assert.equal(row.year, 2026);
  for (const update of [{ date: '2026-02-30' }, { attendance: '' }, { intime: '25:00' }, { biometricid: '' }]) assert.throws(() => f.normalize({ ...input, ...update }));
});
test('one-day deduction uses earnings only and rounds money to two decimals', () => {
  const f = fixture(); assert.equal(f.dailySalary([{ type: 'Credit', amount: 30001 }, { type: 'Deduction', amount: 900 }]).deduction, 1000.03);
  assert.throws(() => f.dailySalary([]), /Configure employee salary/);
});
test('absence creates negative salary and ledger entries, repeat upload updates same linked entries, present reverses', async () => {
  const f = fixture();
  await f.processRow(input, 42, 'admin@test.com'); await f.processRow(input, 42, 'admin@test.com');
  assert.equal(f.payroll.size, 1); assert.equal(f.ledgers.size, 1); assert.equal(f.stored.size, 1);
  for (const write of f.writes) { assert.equal(write.query.colid, 42); assert.equal(write.update.$set.amount, -1000); assert.equal(write.update.$set.month, 'October'); assert.equal(write.update.$set.year, '2026-27'); }
  await f.processRow({ ...input, attendance: 1 }, 42, 'admin@test.com');
  assert.equal(f.payroll.size, 0); assert.equal(f.ledgers.size, 0);
});
for (const reason of ['leave', 'comp', 'holiday', 'weekly']) test(`${reason} prevents salary deduction and checks are scoped`, async () => {
  const f = fixture(reason); const row = await f.processRow(input, 42, 'admin@test.com');
  assert.equal(row.deduction, 0); assert.equal(f.writes.length, 0);
  assert.ok(f.queries.every(({ query }) => query.colid === 42));
});
test('missing salary fails instead of recording zero deduction; ambiguous biometrics rejected', async () => {
  const f = fixture('', false); await assert.rejects(() => f.processRow(input, 42, 'admin'), /Configure employee salary/); assert.equal(f.writes.length, 0);
  const g = fixture(); g.mocks.user.find = () => ({ select() { return this; }, limit() { return this; }, session() { return this; }, lean: async () => [{ email: 'one' }, { email: 'two' }] });
  await assert.rejects(() => g.processRow(input, 42, 'admin'), /multiple users/); assert.equal(g.writes.length, 0);
});
test('paid deduction blocks correction/deletion and unsettled deletion removes both linked entries', async () => {
  const f = fixture(); const row = await f.processRow(input, 42, 'admin');
  [...f.payroll.values()][0].paystatus = 'Paid';
  await assert.rejects(() => f.processRow({ ...input, attendance: 1 }, 42, 'admin'), /already paid/);
  await assert.rejects(() => f.processRow({ id: row._id }, 42, 'admin', true), /already paid/);
  [...f.payroll.values()][0].paystatus = 'Due';
  await f.processRow({ id: row._id }, 42, 'admin', true);
  assert.equal(f.payroll.size, 0); assert.equal(f.ledgers.size, 0); assert.equal(f.stored.size, 0);
});
