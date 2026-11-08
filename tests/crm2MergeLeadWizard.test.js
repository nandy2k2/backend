const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const { Lead } = require('../Models/crm2ds');
const { comparisonFields, mergeChanges, filterQuery } = require('../utils/crm2MergeLead');
const router = require('../controllers/crm2mergewizard');
const a = '111111111111111111111111', b = '222222222222222222222222', c = '333333333333333333333333';
const updatedAt = '2026-11-08T09:00:00.000Z';
const rows = [{ _id: a, name: 'Primary', active: 'No', city: 'Pune', comments: 'Old', updatedAt }, { _id: b, name: 'Second', city: 'Mumbai', updatedAt }, { _id: c, name: 'Third', pipeline: 'Interested', updatedAt }];
const versions = { [a]: updatedAt, [b]: updatedAt, [c]: updatedAt };

test('copies chosen values only, supports choosing blank values, and protects identity and system fields', () => {
  assert.deepEqual(mergeChanges(rows, a, { city: b, comments: b, pipeline: c }, versions), { $set: { active: 'Yes', city: 'Mumbai', pipeline: 'Interested' }, $unset: { comments: 1 } });
  assert.deepEqual(mergeChanges(rows, a, { city: a }, versions), { $set: { active: 'Yes' } });
  for (const field of ['name', 'phone', 'email', 'password', 'active', 'admitted', 'interactions']) assert.throws(() => mergeChanges(rows, a, { [field]: b }, versions), /Invalid field/);
  assert.throws(() => mergeChanges(rows, a, { city: 'not-selected' }, versions), /Invalid field/);
  assert.throws(() => mergeChanges(rows, a, { city: b }, { ...versions, [b]: null }), /changed/);
  assert.ok(!comparisonFields.some(field => ['password', 'phonekey', 'colid'].includes(field.field)));
});
test('picker filters scalar, normalized phone and nested profile fields without changing institution scope', () => {
  const query = filterQuery({ colid: 42 }, { filters: JSON.stringify([{ field: 'name', value: 'Ann' }, { field: 'phone', value: '90081 68822' }, { field: 'programsinterested', value: 'Engineering' }]) });
  assert.equal(query.colid, 42);
  assert.equal(query.$and[0].name.source, 'Ann');
  assert.equal(query.$and[1].$or[1].phonekey.source, '9008168822');
  assert.equal(query.$and[2].$or[1]['programsinterested.program'].source, 'Engineering');
  assert.throws(() => filterQuery({ colid: 42 }, { filters: JSON.stringify([{ field: 'colid', value: 99 }]) }), /Invalid filter field/);
});

async function runMerge(t, selectedRows) {
  t.mock.method(jwt, 'verify', () => ({ colid: 42, user: 'admin@example.com' }));
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ role: 'All' }) }) }));
  const session = { withTransaction: async callback => callback(), endSession: t.mock.fn(async () => {}) };
  t.mock.method(mongoose, 'startSession', async () => session);
  const find = t.mock.method(Lead, 'find', () => ({ select: () => ({ session: current => { assert.equal(current, session); return { lean: async () => selectedRows }; } }) }));
  const update = t.mock.method(Lead, 'updateOne', async () => ({ matchedCount: 1 }));
  const deactivate = t.mock.method(Lead, 'updateMany', async () => ({ matchedCount: 2 }));
  const handler = router.stack.find(layer => layer.route?.path === '/merge').route.stack[0].handle;
  let status = 200, data;
  await handler({ get: () => 'Bearer signed-token', body: { colid: 999, ids: [a, b, c], primaryId: a, choices: { city: b, pipeline: c }, versions } }, { status(code) { status = code; return this; }, json(value) { data = value; } });
  return { status, data, session, find, update, deactivate };
}
test('updates primary and deactivates the other leads using the same transaction and institution', async t => {
  const { status, data, session, find, update, deactivate } = await runMerge(t, rows);
  assert.equal(status, 200);
  assert.equal(data.deactivated, 2);
  assert.deepEqual(find.mock.calls[0].arguments[0], { colid: 42, _id: { $in: [a,b,c] } });
  assert.deepEqual(update.mock.calls[0].arguments[1].$set, { active: 'Yes', city: 'Mumbai', pipeline: 'Interested', updatedby: 'admin@example.com' });
  assert.deepEqual(deactivate.mock.calls[0].arguments[0], { colid: 42, _id: { $in: [b,c] } });
  assert.equal(deactivate.mock.calls[0].arguments[1].$set.active, 'No');
  assert.equal(update.mock.calls[0].arguments[2].session, session);
  assert.equal(deactivate.mock.calls[0].arguments[2].session, session);
  assert.equal(session.endSession.mock.calls.length, 1);
});
test('a missing or out-of-scope lead stops the merge before any write', async t => {
  const { status, update, deactivate } = await runMerge(t, rows.slice(0, 2));
  assert.equal(status, 400);
  assert.equal(update.mock.calls.length, 0);
  assert.equal(deactivate.mock.calls.length, 0);
});
