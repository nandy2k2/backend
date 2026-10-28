const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const file = path.join(__dirname, '../controllers/crm2applicationsctlrds.js'), actualRequire = createRequire(file);
const leadid = '111111111111111111111111', appid = '222222222222222222222222', mappingid = '333333333333333333333333';
const lean = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
function fixture({ owned = true, current = null } = {}) {
  const queries = [], creates = [], updates = [];
  const lead = { _id: leadid, name: 'Ann', email: 'ann@example.com', phone: '123', programsinterested: [{ academicyear: '2026-27', programcode: 'P1' }] };
  const mapping = { _id: mappingid, academicyear: '2026-27', programcode: 'P1', program: 'Science', formid: 'form1' };
  const Application = { schema: { paths: { name: {}, email: {}, phone: {}, extraFields: {}, documents: {}, paymentstatus: {}, programcode: {}, colid: {} } },
    find: query => { queries.push(query); return lean(current ? [current] : []); },
    findOne: query => { queries.push(query); return Promise.resolve(current); },
    create: async data => { creates.push(data); return data; },
    findOneAndUpdate: async (query, update) => { queries.push(query); updates.push(update); return { ...current, ...update.$set }; }
  };
  // findOne is both thenable for document reads and supports lean for the scoped read endpoint.
  Application.findOne = query => { queries.push(query); return Object.assign(Promise.resolve(current), lean(current)); };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require(name) {
    if (name === '../Models/admissionapplicationdynamic') return Application;
    if (name === '../Models/crm2ds') return { Lead: { findOne: query => { queries.push(query); return lean(owned ? lead : null); } } };
    if (name === '../Models/crm2configurationds') return { FormMapping: { find: query => { queries.push(query); return lean([mapping]); }, findOne: () => lean(mapping) } };
    if (name === '../Models/crm2programds') return { Assignment: { find: () => lean([]) } };
    if (name === '../Models/mprograms') return { findOne: () => lean({ program: 'Science', type: 'UG' }) };
    if (name === '../Models/user') return { exists: async () => true };
    if (name === '../Models/applicationfeeds' || name === '../Models/provisionaladmissionfeeds') return { findOne: () => lean({ amount: 100 }) };
    if (name === '../services/crm2ApplicationIndexes') return async () => {};
    return actualRequire(name);
  } });
  const invoke = async (method, route, input = {}, portalLead) => {
    const handle = module.exports.router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
    let status = 200, data;
    const values = { colid: 42, user: 'me@example.com', leadid, ...input };
    await handle({ portalLead, query: method === 'get' ? values : {}, body: method === 'post' ? values : {} }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  };
  return { invoke, queries, creates, updates };
}
test('application creation binds canonical lead/program, starts draft and initializes pending fee statuses', async () => {
  const f = fixture(), result = await f.invoke('post', '/new', { mappingid });
  assert.equal(result.status, 200); assert.equal(f.creates[0].colid, 42);
  assert.equal(f.creates[0].crmleadid, leadid); assert.equal(f.creates[0].name, 'Ann');
  assert.equal(f.creates[0].programcode, 'P1'); assert.equal(f.creates[0].applicationstatus, 'Draft');
  assert.equal(f.creates[0].paymentstatus, 'Pending'); assert.equal(f.creates[0].provisionalpaymentstatus, 'Pending');
});
test('saving preserves program, institution and payment statuses while supporting submission', async () => {
  const f = fixture({ current: { _id: appid, applicationstatus: 'Draft', name: 'Ann', email: 'ann@example.com', phone: '123' } });
  const result = await f.invoke('post', '/save', { id: appid, name: 'Ann updated', programcode: 'Spoof', paymentstatus: 'Paid', extraFields: { question: 'answer' }, submit: true });
  assert.equal(result.status, 200); assert.equal(f.updates[0].$set.name, 'Ann updated');
  assert.equal(f.updates[0].$set.programcode, undefined); assert.equal(f.updates[0].$set.paymentstatus, undefined);
  assert.equal(f.updates[0].$set.applicationstatus, 'Applied'); assert.equal(f.queries.at(-1).colid, 42);
});
test('submitted forms cannot be edited and another owner cannot access applications', async () => {
  const f = fixture({ current: { _id: appid, applicationstatus: 'Applied' } });
  assert.equal((await f.invoke('post', '/save', { id: appid })).status, 400); assert.equal(f.updates.length, 0);
  const other = fixture({ owned: false });
  assert.equal((await other.invoke('get', '/', { leadmode: 'my' })).status, 400);
  assert.equal(other.queries[0].colid, 42); assert.equal(other.queries[0].counselloremail.source, '^me@example\\.com$');
});
test('list includes linked and legacy applications only inside the institution', async () => {
  const f = fixture(); await f.invoke('get', '/');
  const query = f.queries.at(-1); assert.equal(query.colid, 42); assert.equal(query.$or[0].crmleadid, leadid);
  assert.equal(query.$or[1].email.source, '^ann@example\\.com$');
});
test('lead portal application reads ignore forged institution and lead IDs', async () => {
  const f = fixture();
  await f.invoke('get', '/', { colid: 999, leadid: '444444444444444444444444', user: 'spoof@example.com' }, { _id: leadid, colid: 42, email: 'ann@example.com', phone: '123' });
  assert.equal(f.queries[0].colid, 42); assert.equal(f.queries[0].$or[0].crmleadid, leadid);
});
test('portal can update its submitted Applied form without changing payment or decision fields', async () => {
  const f = fixture({ current: { _id: appid, applicationstatus: 'Applied', name: 'Ann', email: 'ann@example.com', phone: '123' } });
  const result = await f.invoke('post', '/save', { id: appid, name: 'Ann revised', paymentstatus: 'Paid', applicationstatus: 'Approved' }, { _id: leadid, colid: 42, email: 'ann@example.com', phone: '123' });
  assert.equal(result.status, 200); assert.equal(f.queries.at(-1).applicationstatus, 'Applied');
  assert.equal(f.updates[0].$set.name, 'Ann revised'); assert.equal(f.updates[0].$set.applicationstatus, undefined); assert.equal(f.updates[0].$set.paymentstatus, undefined);
});
