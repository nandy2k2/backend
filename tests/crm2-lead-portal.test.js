const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const file = path.join(__dirname, '../controllers/crm2leadportalctlrds.js'), actual = createRequire(file);
function fixture() {
  const module = { exports: {} }, saves = [], links = [];
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require(name) {
    if (name === '../services/crm2LeadPortalAuth') return { login: async () => ({}), authenticate: (_, __, next) => next() };
    if (name === './crm2applicationsctlrds') return { router: actual('express').Router() };
    if (name === '../Models/admissionapplicationdynamic') return { updateMany: async (query, update) => links.push({ query, update }) };
    if (name === './crm2ctlrds') return Object.assign(() => {}, { saveLead: async (body, colid) => { saves.push({ body, colid }); return { _id: body.id, ...body }; } });
    return actual(name);
  } });
  return { ...module.exports, saves, links };
}
test('profile metadata and responses exclude staff assignments, security and operational fields', () => {
  const f = fixture();
  for (const field of ['password','colid','active','admitted','counselloremail','agentemail','lastlogindate','pipeline','source','admissionstatus']) assert.equal(f.allowed.has(field), false, field);
  for (const field of ['name','email','phone','programsinterested','education','documents']) assert.equal(f.allowed.has(field), true, field);
  assert.equal(f.profile({ _id: 'me', colid: 42, name: 'Ann', password: 'secret', counselloremail: 'staff@example.com' }).password, undefined);
});
test('profile save pins identity to the session and strips tampered administrative fields', async () => {
  const f = fixture();
  const handler = f.router.stack.find(layer => layer.route?.path === '/profile' && layer.route.methods.post).route.stack[0].handle;
  let result;
  await handler({ portalLead: { _id: 'own-lead', colid: 42, email: 'ann@example.com' }, body: { id: 'other', colid: 99, name: 'Ann updated', admitted: 'Yes', counselloremail: 'other@example.com', password: 'changed', programsinterested: [] } }, { json(value) { result = value; }, status() { return this; } });
  assert.equal(result.success, true); assert.equal(f.saves[0].body.id, 'own-lead'); assert.equal(f.saves[0].colid, 42);
  assert.equal(f.saves[0].body.admitted, undefined); assert.equal(f.saves[0].body.password, undefined); assert.equal(f.saves[0].body.counselloremail, undefined);
});
test('contact changes retain legacy applications by binding them to the authenticated lead', async () => {
  const f = fixture();
  const handler = f.router.stack.find(layer => layer.route?.path === '/profile' && layer.route.methods.post).route.stack[0].handle;
  await handler({ portalLead: { _id: 'own-lead', colid: 42, email: 'old@example.com', phone: '123' }, body: { email: 'new@example.com' } }, { json() {}, status() { return this; } });
  assert.equal(f.links[0].query.colid, 42); assert.equal(f.links[0].query.email.source, '^old@example\\.com$');
  assert.equal(f.links[0].update.$set.crmleadid, 'own-lead');
});
