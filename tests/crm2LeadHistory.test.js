const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { History, recordDuplicate, emailKey, phoneKey } = require('../services/crm2LeadHistory');
test('email and phone matching normalization', () => {
  assert.equal(emailKey(' Person@Example.com '), 'person@example.com');
  assert.equal(phoneKey('+91 (987) 654-3210'), '919876543210');
});
test('duplicate history sequences per institution and lead and records actor', async () => {
  const Counter = mongoose.models.crm2historycounter;
  const oldCounter = Counter.findOneAndUpdate, oldCreate = History.create;
  const counts = new Map();
  Counter.findOneAndUpdate = async query => { const value = (counts.get(query._id) || 0) + 1; counts.set(query._id, value); return { value }; };
  History.create = async row => row;
  try {
    const lead = { _id: 'abc', colid: 10, email: 'person@example.com', phone: '1234567890' };
    const input = { email: 'PERSON@example.com', phone: '123-456-7890' };
    const first = await recordDuplicate(lead, input, { email: 'agent@example.com', name: 'Agent' }, 'Agent');
    const second = await recordDuplicate(lead, input, 'api@example.com', 'API');
    const other = await recordDuplicate({ ...lead, colid: 20 }, input, 'api@example.com', 'API');
    assert.equal(first.order, 1); assert.equal(second.order, 2); assert.equal(other.order, 1);
    assert.deepEqual(first.matchedby, ['Email','Phone']); assert.equal(first.actorname, 'Agent'); assert.equal(first.colid, 10);
  } finally { Counter.findOneAndUpdate = oldCounter; History.create = oldCreate; }
});
