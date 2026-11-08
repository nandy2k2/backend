const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../Models/user');
const { Lead } = require('../Models/crm2ds');
const router = require('../controllers/crm2MailIntake');

test('review tabs query stored statuses within the signed-in institution', async t => {
  const Candidate = mongoose.models.crm2mailcandidate;
  t.mock.method(jwt, 'verify', () => ({ colid: 42, user: 'staff@example.com' }));
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ colid: 42, email: 'staff@example.com' }) }) }));
  const find = t.mock.method(Candidate, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
  const handler = router.stack.find(layer => layer.route?.path === '/candidates').route.stack[0].handle;
  const load = async query => {
    let status = 200;
    await handler({ query, get: () => 'Bearer signed-token' }, { status(code) { status = code; return this; }, json() {} });
    return status;
  };
  const id = '111111111111111111111111';
  assert.equal(await load({ bucket: 'accepted', colid: 99 }), 200);
  assert.equal(await load({ bucket: 'rejected' }), 200);
  assert.equal(await load({ bucket: 'fresh', ids: id }), 200);
  assert.equal(await load({ bucket: 'fresh', ids: 'invalid' }), 400);
  assert.equal(await load({}), 200);
  assert.deepEqual(find.mock.calls.map(call => call.arguments[0]), [
    { colid: 42, deletedat: null, status: { $in: ['Lead created', 'Duplicate recorded'] } },
    { colid: 42, deletedat: null, status: 'Rejected' },
    { colid: 42, deletedat: null, status: 'Pending', _id: { $in: [id] } },
    { colid: 42, deletedat: null }
  ]);
});

test('bulk delete marks only selected intake records in the current tab and institution', async t => {
  const Candidate = mongoose.models.crm2mailcandidate;
  t.mock.method(jwt, 'verify', () => ({ colid: 42, user: 'staff@example.com' }));
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ colid: 42, email: 'staff@example.com' }) }) }));
  const update = t.mock.method(Candidate, 'updateMany', async () => ({ modifiedCount: 1 }));
  const id = '111111111111111111111111';
  const handler = router.stack.find(layer => layer.route?.path === '/candidates/delete').route.stack[0].handle;
  await handler({ body: { ids: [id, id], bucket: 'accepted', colid: 99 }, get: () => 'Bearer signed-token' }, { json: data => assert.equal(data.deleted, 1) });
  const [query, changes] = update.mock.calls[0].arguments;
  assert.deepEqual(query, { colid: 42, _id: { $in: [id] }, status: { $in: ['Lead created', 'Duplicate recorded'] }, deletedat: null });
  assert.equal(changes.$set.deletedby, 'staff@example.com');
  assert.ok(changes.$set.deletedat instanceof Date);
});

test('rejected records can be edited and an unsuccessful acceptance leaves them rejected', async t => {
  const Candidate = mongoose.models.crm2mailcandidate;
  t.mock.method(jwt, 'verify', () => ({ colid: 42, user: 'staff@example.com' }));
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ colid: 42, email: 'staff@example.com' }) }) }));
  const update = t.mock.method(Candidate, 'updateOne', async () => ({ matchedCount: 1 }));
  const id = '111111111111111111111111';
  const claim = t.mock.method(Candidate, 'findOneAndUpdate', () => ({ lean: async () => ({ _id: id, email: 'lead@example.com' }) }));
  t.mock.method(Lead, 'find', () => ({ lean: async () => { throw new Error('Test lookup failure'); } }));
  const invoke = (path, body, json) => router.stack.find(layer => layer.route?.path === path).route.stack[0].handle({ body, get: () => 'Bearer signed-token' }, { json });
  await invoke('/candidate', { bucket: 'rejected', id, name: 'Updated' }, data => assert.equal(data.success, true));
  await invoke('/review', { bucket: 'rejected', ids: [id], approve: true }, data => assert.equal(data.results[0].error, 'Test lookup failure'));
  assert.equal(update.mock.calls[0].arguments[0].status, 'Rejected');
  assert.equal(claim.mock.calls[0].arguments[0].status, 'Rejected');
  assert.equal(update.mock.calls[1].arguments[1].$set.status, 'Rejected');
});

test('intake 2 creates new leads with the server-owned Email agent mode', async t => {
  const Candidate = mongoose.models.crm2mailcandidate;
  t.mock.method(jwt, 'verify', () => ({ colid: 42, user: 'staff@example.com' }));
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ colid: 42, email: 'staff@example.com' }) }) }));
  const id = '111111111111111111111111';
  t.mock.method(Candidate, 'findOneAndUpdate', () => ({ lean: async () => ({ _id: id, name: 'Lead', email: 'lead@example.com', phone: '9008168822' }) }));
  t.mock.method(Candidate, 'updateOne', async () => ({ matchedCount: 1 }));
  t.mock.method(Lead, 'find', () => ({ lean: async () => [] }));
  const create = t.mock.method(require('../controllers/crm2ctlrds'), 'saveLead', async () => ({}));
  const handler = router.stack.find(layer => layer.route?.path === '/review').route.stack[0].handle;
  await handler({ body: { bucket: 'fresh', ids: [id], approve: true, addedby: 'API' }, get: () => 'Bearer signed-token' }, { json: data => assert.equal(data.results[0].status, 'Lead created') });
  assert.equal(create.mock.calls[0].arguments[1], 42);
  assert.deepEqual(create.mock.calls[0].arguments[5], { creationMode: 'Email agent' });
});
