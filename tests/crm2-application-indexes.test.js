const test = require('node:test');
const assert = require('node:assert/strict');
const ensure = require('../services/crm2ApplicationIndexes');
test('builds replacement and legacy-public constraints before dropping only old broad indexes', async () => {
  const events = [], Model = { collection: {
    createIndex: async (keys, options) => events.push({ type: 'create', keys, options }),
    indexes: async () => [{ name: 'oldemail', key: { colid: 1, email: 1 }, unique: true }, { name: 'oldphone', key: { colid: 1, phone: 1 }, unique: true }, { name: 'other', key: { colid: 1, formid: 1 }, unique: true }],
    dropIndex: async name => events.push({ type: 'drop', name })
  } };
  await ensure(Model); await ensure(Model);
  assert.equal(events.length, 6); assert.ok(events.slice(0, 4).every(row => row.type === 'create'));
  assert.deepEqual(events.filter(row => row.type === 'drop').map(row => row.name), ['oldemail','oldphone']);
  assert.deepEqual(events[1].options.partialFilterExpression, { crmleadid: null });
});
test('failure to build a replacement never removes the old constraints and can retry', async () => {
  let fail = true, dropped = 0;
  const Model = { collection: { createIndex: async () => { if (fail) throw new Error('build failed'); }, indexes: async () => [], dropIndex: async () => dropped++ } };
  await assert.rejects(ensure(Model), /build failed/); assert.equal(dropped, 0);
  fail = false; await ensure(Model);
});
