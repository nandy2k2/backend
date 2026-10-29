const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const { fineToday } = require('../utils/conductExamFine');
const student = { name: 'Ann', colid: 42, regno: 'R1', email: 'ann@example.com', academicyear: '2026-27', program: 'Science', programcode: 'P1', regulation: 'R2026', semester: '1' };
const today = fineToday();
const earlier = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0,10);
const policy = { _id: 'policy1', colid: 42, academicyear: '2026-27', program: 'Science', programcode: 'P1', startdate: earlier(-2), enddate: earlier(2), amount: 10, finetype: 'per day' };
const fees = [{ _id: 'fee1', ...student, balance: 500, amount: 500, paid: 0, duedate: earlier(-10) }, { _id: 'fee2', ...student, balance: 500, amount: 500, paid: 0, duedate: earlier(-5) }];
const chain = value => ({ lean: async () => value, select() { return this; }, sort() { return this; }, limit() { return this; } });
function serviceFixture(rules = [policy]) {
  const records = new Map(), queries = [], writes = [];
  const file = path.join(__dirname, '../services/lateFeePayment.js'), actual = createRequire(file), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require(name) {
    if (name.endsWith('latefeepolicyds')) return { find: query => { queries.push(query); return chain(rules.filter(row => Object.entries(query).every(([key,value]) => row[key] === value))); } };
    if (name.endsWith('latefeesledgerds')) return { updateOne: async (query, update) => { writes.push(query); const key = JSON.stringify(query); if (!records.has(key)) records.set(key, { ...query, ...update.$setOnInsert }); } };
    return actual(name);
  } });
  return { ...module.exports, records, queries, writes };
}
test('per-day policy applies once overall for multiple due items; excludes future and foreign rules', async () => {
  const f = serviceFixture([policy, { ...policy, _id: 'foreign', colid: 99 }]);
  const result = await f.quote(42, [...fees, { ...fees[0], _id: 'future', duedate: earlier(5) }], student, today);
  assert.equal(result.total, 30); assert.equal(result.applied.length, 1); assert.equal(result.applied[0].ledgerids.length, 2);
  assert.equal(f.queries[0].colid, 42);
});
test('flat fine does not multiply by days or fee items and outside ranges charge nothing', async () => {
  const f = serviceFixture([{ ...policy, finetype: 'flat' }]);
  assert.equal((await f.quote(42, fees, student, today)).total, 10);
  assert.equal((await f.quote(42, fees, student, earlier(4))).total, 0);
  assert.equal((await f.quote(42, [], student, today)).total, 0);
});
test('policies match each ledger academic year instead of incorrectly reusing the student current year', async () => {
  const f = serviceFixture([policy, { ...policy, _id: 'old', academicyear: '2025-26', amount: 5 }]);
  const result = await f.quote(42, [fees[0], { ...fees[1], academicyear: '2025-26' }], student, today);
  assert.equal(result.total, 45); assert.equal(result.applied.length, 2);
});
function controllerFixture({ fine = true, rules = [policy] } = {}) {
  const service = serviceFixture(rules), sessions = [], queries = [], basePayments = [];
  let online;
  const file = path.join(__dirname, '../controllers/studentonlinepaymentctlrds.js'), actual = createRequire(file), module = { exports: {} };
  const models = {
    ledgerstud: { find: query => { queries.push(query); return chain(fees); }, findOne: async query => ({ ...fees.find(row => row._id === query._id), save: async () => basePayments.push(query) }) },
    mastergatewayds: { findOne: () => chain({ _id: 'gateway1', gatewayname: 'ICICI', type: 'Internal' }) },
    studentonlinepaymentds: { create: async value => { online = { ...value, _id: 'online1', save: async () => {} }; sessions.push(value); return online; }, findOne: async () => online },
    icicipaymentds: { find: () => chain([]) },
    user: { findOne: query => { queries.push(query); return chain(student); } }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require(name) {
    if (name === '../services/lateFeePayment') return service;
    return name.startsWith('../Models/') ? models[name.split('/').at(-1)] || {} : actual(name);
  } });
  const session = async () => {
    let status = 200, data;
    await module.exports.createStudentPaymentSession({ onlineFees3: fine, body: { colid: 42, regno: 'R1', gatewayid: 'gateway1', ledgerids: ['fee1','fee2'], amount: 1, latefineamount: 0 } }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  };
  const settle = async (status = 'SUCCESS', amount = 1030) => module.exports.settleSuccessfulStudentOnlinePayment({ status, amount, paidamount: amount, colid: 42, studentonlinepaymentid: 'online1', refno: 'GATEWAY', paiddate: new Date() });
  return { ...service, sessions, queries, basePayments, session, settle };
}
test('Online Fees 3 server session ignores client totals and adds fine to the existing gateway payload', async () => {
  const f = controllerFixture(); const result = await f.session();
  assert.equal(result.status, 200); assert.equal(result.data.data.gatewayPayload.amount, 1030);
  assert.equal(f.sessions[0].baseamount, 1000); assert.equal(f.sessions[0].latefineamount, 30);
  assert.equal(f.sessions[0].paymentsource, 'OnlineFees3');
  assert.ok(f.queries.some(query => query.colid === 42 && query.regno === 'R1' && query.role));
});
test('only successful payments populate the separate ledger; retries do not duplicate entries or repeat fee settlement', async () => {
  const f = controllerFixture(); await f.session();
  await f.settle('FAILED'); assert.equal(f.records.size, 0); assert.equal(f.basePayments.length, 0);
  await f.settle(); assert.equal(f.records.size, 1); assert.equal(f.basePayments.length, 2);
  const record = [...f.records.values()][0]; assert.equal(record.paid, 30); assert.equal(record.balance, 0); assert.equal(record.colid, 42); assert.equal(record.regno, 'R1');
  await f.settle(); assert.equal(f.records.size, 1); assert.equal(f.basePayments.length, 2);
});
test('underpaid gateway results cannot settle fees or record paid fines', async () => {
  const f = controllerFixture(); await f.session();
  await assert.rejects(f.settle('SUCCESS', 1000), /less than/);
  assert.equal(f.records.size, 0); assert.equal(f.basePayments.length, 0);
  const noFine = controllerFixture({ rules: [] }); await noFine.session();
  await assert.rejects(noFine.settle('SUCCESS', 1), /less than/);
  assert.equal(noFine.basePayments.length, 0);
});
test('Online Fees 2 retains its previous session total and never applies a new policy', async () => {
  const f = controllerFixture({ fine: false }); const result = await f.session();
  assert.equal(result.status, 200); assert.equal(result.data.data.gatewayPayload.amount, 1000); assert.equal(f.queries.some(query => query.academicyear), false);
  await f.settle('SUCCESS', 1000); assert.equal(f.records.size, 0);
});
test('late fine policy CRUD excludes course type and scopes masters, updates, deletes and reporting', async () => {
  const queries = [], writes = [];
  const file = path.join(__dirname, '../controllers/latefeepolicyctlrds.js'), module = { exports: {} };
  const Policy = {
    create: async row => { writes.push(row); return row; },
    findOneAndUpdate: async (query, update) => { queries.push(query); writes.push(update.$set); return update.$set; },
    deleteMany: async query => { queries.push(query); return { deletedCount: 1 }; },
    find: query => { queries.push(query); return chain([]); }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require(name) {
    if (name.endsWith('conductexamfinectlrds')) return { options: () => {} };
    if (name.endsWith('latefeepolicyds')) return Policy;
    if (name.endsWith('latefeesledgerds')) return { find: query => { queries.push(query); return chain([]); } };
    return { findOne: query => { queries.push(query); return chain({ program: 'Canonical program' }); } };
  } });
  const invoke = async (action, body, query = {}) => {
    let status = 200, result;
    await module.exports[action]({ body, query }, { status(value) { status = value; return this; }, json(value) { result = value; } });
    return { status, result };
  };
  const row = { colid: 42, academicyear: '2026-27', programcode: 'P1', program: 'Spoof', startdate: today, enddate: earlier(5), amount: 50, finetype: 'flat', coursetype: 'per course' };
  assert.equal((await invoke('save', { ...row, id: 'p1' })).status, 200);
  assert.equal(writes[0].coursetype, undefined); assert.equal(writes[0].program, 'Canonical program'); assert.equal(queries.at(-1).colid, 42);
  assert.equal((await invoke('save', { ...row, amount: -5 })).status, 400);
  assert.equal((await invoke('save', { ...row, enddate: earlier(-1) })).status, 400);
  await invoke('remove', { colid: 42, ids: ['p1'] }); assert.equal(queries.at(-1).colid, 42);
  await invoke('bulk', { colid: 42, rows: [{ ...row, colid: 99 }] }); assert.equal(writes.at(-1).colid, 42);
  await invoke('ledger', {}, { colid: 42, fromdate: today, todate: today, filters: JSON.stringify([{ field: 'colid', value: 99 }, { field: 'regno', value: 'R1' }]) });
  assert.equal(queries.at(-1).colid, 42); assert.equal(queries.at(-1).regno, 'R1'); assert.equal(queries.at(-1).paiddate.$gte.toISOString(), new Date(`${today}T00:00:00+05:30`).toISOString());
});
