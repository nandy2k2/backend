const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  const calls = [];
  const Task = Object.fromEntries(['findOneAndUpdate', 'updateOne', 'updateMany'].map(method => [method, async (...args) => calls.push({ method, args })]));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/crm2FollowupTask.js'), 'utf8'), { module, require: () => ({ Task }) });
  return { ...module.exports, calls };
}
test('follow-up creates one scoped task and preserves manually changed status on updates', async () => {
  const f = fixture(), lead = { _id: 'lead1', name: 'Ann', email: 'ann@example.com', phone: '123' };
  await f.syncFollowupTask(42, lead, 'interaction1', { details: 'Call again', nextfollowupdate: '2026-11-01' }, 'me@example.com');
  const { args: [query, update, options] } = f.calls[0];
  assert.equal(query.colid, 42); assert.equal(query.leadid, 'lead1'); assert.equal(query.interactionid, 'interaction1');
  assert.equal(update.$set.task, 'Follow up: Call again'); assert.equal(update.$set.leadphone, '123');
  assert.equal(update.$set.duedate, '2026-11-01'); assert.equal(update.$set.status, undefined);
  assert.equal(update.$setOnInsert.status, 'Open'); assert.equal(options.upsert, true);
  await f.syncFollowupTask(42, lead, 'interaction1', { details: 'New date', nextfollowupdate: '2026-11-02' }, 'me@example.com');
  assert.equal(f.calls[1].args[0].interactionid, query.interactionid);
});
test('removing follow-up or interaction closes only the linked scoped tasks', async () => {
  const f = fixture();
  await f.syncFollowupTask(42, { _id: 'lead1' }, 'interaction1', {}, 'me@example.com');
  assert.equal(f.calls[0].method, 'updateOne'); assert.equal(f.calls[0].args[1].$set.status, 'Closed');
  await f.closeFollowupTasks(42, 'lead1', ['interaction1'], 'me@example.com');
  const [query, update] = f.calls[1].args;
  assert.equal(query.colid, 42); assert.equal(query.leadid, 'lead1');
  assert.equal(query.interactionid.$in[0], 'interaction1'); assert.equal(update.$set.status, 'Closed');
});
