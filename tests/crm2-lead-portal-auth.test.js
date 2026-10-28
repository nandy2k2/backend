const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const file = path.join(__dirname, '../services/crm2LeadPortalAuth.js'), actual = createRequire(file);
function fixture({ candidates = [], session = null, lead = null } = {}) {
  const queries = [], sessions = [];
  const lean = data => ({ select() { return this; }, limit() { return this; }, lean: async () => data });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, Buffer, Date, require(name) {
    if (name === '../Models/crm2ds') return { Lead: { find: query => { queries.push(query); return lean(candidates); }, findOne: query => { queries.push(query); return lean(lead); } } };
    if (name === '../Models/crm2leadportalsessionds') return { create: async row => sessions.push(row), findOne: query => { queries.push(query); return lean(session); } };
    return actual(name);
  } });
  return { ...module.exports, queries, sessions };
}
const salt = '0123456789abcdef0123456789abcdef', password = 'correct-password';
const stored = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
test('verifies Lead master scrypt passwords and rejects bad or malformed credentials', async () => {
  const f = fixture();
  assert.equal(await f.verify(password, stored), true); assert.equal(await f.verify('wrong', stored), false);
  assert.equal(await f.verify(password, 'scrypt:bad:bad'), false);
  assert.equal(await f.verify('', stored), false);
});
test('login stores only a token digest with lead and institution scope and expiry', async () => {
  const f = fixture({ candidates: [{ _id: 'lead1', colid: 42, password: stored }] });
  const result = await f.login('ANN@EXAMPLE.COM', password, 42);
  assert.equal(f.queries[0].emailkey, 'ann@example.com'); assert.equal(f.queries[0].colid, 42);
  assert.match(result.token, /^[a-f0-9]{64}$/); assert.equal(f.sessions[0].tokenhash, f.digest(result.token));
  assert.notEqual(f.sessions[0].tokenhash, result.token); assert.equal(f.sessions[0].leadid, 'lead1');
  assert.equal(f.sessions[0].credentialhash, f.digest(stored)); assert.ok(f.sessions[0].expiresAt > new Date());
});
test('inactive leads cannot log in and duplicate institutions require explicit selection', async () => {
  const inactive = fixture({ candidates: [{ password: stored, active: 'No' }] });
  await assert.rejects(inactive.login('ann@example.com', password), /Invalid credentials/);
  const duplicate = fixture({ candidates: [{ password: stored, colid: 1 }, { password: stored, colid: 2 }] });
  await assert.rejects(duplicate.login('ann@example.com', password), /institution ID/);
  assert.equal(duplicate.sessions.length, 0);
});
test('session authentication ignores client identity and expires on password changes', async () => {
  const f = fixture();
  const session = { leadid: 'own-lead', colid: 42, credentialhash: f.digest(stored) };
  const good = fixture({ session, lead: { _id: 'own-lead', colid: 42, password: stored } });
  const req = { get: () => `Bearer ${'a'.repeat(64)}`, body: { leadid: 'other-lead', colid: 99 } };
  let next = false;
  await good.authenticate(req, { status() { throw new Error('unexpected rejection'); } }, () => { next = true; });
  assert.equal(next, true); assert.equal(good.queries[1]._id, 'own-lead'); assert.equal(good.queries[1].colid, 42);
  const changed = fixture({ session, lead: { password: 'changed' } }); let status;
  await changed.authenticate(req, { status(code) { status = code; return this; }, json() {} }, () => assert.fail('must not authenticate'));
  assert.equal(status, 401);
});
