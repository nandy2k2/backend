const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup() {
  const routes = {}, calls = [];
  const chain = value => ({ sort() { return this; }, lean: async () => value });
  const model = {
    find(query) { calls.push({ query }); return chain([{ role: 'coe', signaturelink: 'https://example.com/coe.png' }]); },
    async findOneAndUpdate(query, update, options) { calls.push({ query, update, options }); return { _id: 'sig1', ...update.$set }; },
    async deleteMany(query) { calls.push({ query }); return { deletedCount: 1 }; }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/rolewisesignaturectlrds.js'), 'utf8'), { module, require: name => name === 'express' ? { Router: () => ({ get: (route, handler) => { routes[`GET ${route}`] = handler; }, post: (route, handler) => { routes[`POST ${route}`] = handler; } }) } : name.endsWith('/user') ? { distinct: async (_, query) => { calls.push({ query }); return ['COE', 'Faculty']; } } : model });
  const call = async (route, source) => { let status = 200, body; await routes[route]({ query: source, body: source }, { status(value) { status = value; return this; }, json(value) { body = value; } }); return { status, body }; };
  return { calls, call };
}
test('lists signatures and roles within the institution and normalizes role choices', async () => {
  const { call, calls } = setup();
  const result = await call('GET /', { colid: 42 });
  assert.equal(result.status, 200);
  assert.equal(JSON.stringify(result.body.roles), JSON.stringify(['coe', 'faculty']));
  assert.ok(calls.every(call => call.query.colid === 42));
});
test('upserts one signature per normalized role and scopes edits and deletes', async () => {
  const { call, calls } = setup();
  await call('POST /', { colid: 42, role: ' COE ', signaturelink: 'https://example.com/sign.png', unwanted: 'ignored' });
  assert.equal(calls[0].query.role, 'coe'); assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[0].update.$set.unwanted, undefined);
  await call('POST /', { colid: 42, id: 'sig1', role: 'COE', signaturelink: 'https://example.com/new.png' });
  assert.equal(calls[1].query._id, 'sig1');
  await call('POST /delete', { colid: 42, ids: ['sig1'] });
  assert.ok(calls.every(call => call.query.colid === 42));
});
test('rejects missing institution, invalid signature URL, and empty deletion', async () => {
  const { call, calls } = setup();
  assert.equal((await call('GET /', {})).status, 400);
  assert.equal((await call('POST /', { colid: 42, role: 'coe', signaturelink: 'javascript:bad' })).status, 400);
  assert.equal((await call('POST /delete', { colid: 42, ids: [] })).status, 400);
  assert.equal(calls.length, 0);
});
