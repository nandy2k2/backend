const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const file = path.join(__dirname, '../controllers/crm2counselordashboardctlrds.js'), actual = createRequire(file);
function fixture({ validUser = true, ownLead = null, telecaller = false } = {}) {
  const queries = [], writes = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, process, Date, require(name) {
    if (name === 'jsonwebtoken') return { verify: () => ({ colid: '42', user: 'me@example.com' }) };
    if (name === '../Models/user') return { exists: async query => { queries.push(['user',query]); return validUser; }, findOne: () => chain(null) };
    if (name === '../Models/mprograms') return { distinct: async (_, query) => { queries.push(['programs',query]); return ['2026-27']; } };
    if (name === '../Models/crm2staffloginds') return { updateOne: async (...args) => writes.push(args), find: query => { queries.push(['logins',query]); return { sort() { return this; }, limit() { return this; }, lean: async () => [{ loggedAt: new Date('2026-10-28') }, { loggedAt: new Date('2026-10-25') }] }; } };
    if (name === '../Models/crm2ds') return { masterModels: { pipeline: { exists: async query => { queries.push(['pipeline',query]); return query.name === 'Interested'; } } }, Lead: { schema: actual('../Models/crm2ds').Lead.schema, findOneAndUpdate: (query, update) => { queries.push(['pipelineupdate',query]); writes.push(update); return chain(ownLead); }, find: query => { queries.push(['report',query]); return chain([]); }, findOne: query => { queries.push(['lead',query]); return chain(ownLead); }, distinct: async (_, query) => { queries.push(['leads',query]); return ['own-lead']; }, countDocuments: async query => { queries.push(['count',query]); return 2; } } };
    if (name === '../Models/crm2leadrecordsds') return { Note: { create: async row => { writes.push(row); return row; }, find: query => { queries.push(['notes',query]); return chain([]); }, findOneAndUpdate: async (query, update) => { queries.push(['noteupdate',query]); writes.push(update); return update; } }, Task: { find: query => { queries.push(['tasklist',query]); return chain([]); }, findOneAndUpdate: async (query, update) => { queries.push(['status',query]); writes.push(update); return { status: update.$set.status }; }, countDocuments: async query => { queries.push(['tasks',query]); return 3; } } };
    return actual(name);
  } });
  const invoke = async (method, route, input = {}, params = {}) => {
    let status = 200, data;
    const handle = module.exports.router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack[0].handle;
    await handle({ method: method.toUpperCase(), telecallerDashboard: telecaller, params, get: () => 'Bearer signed-token', query: { colid: 42, user: 'me@example.com', ...input }, body: input }, { json(value) { data = value; }, status(value) { status = value; return this; } });
    return { status, data };
  };
  return { invoke, queries, writes };
}
test('summary is scoped by institution, counselor and year; pending counts use only owned lead IDs', async () => {
  const f = fixture(), result = await f.invoke('get', '/', { academicyear: '2026-27' });
  assert.equal(result.status, 200); assert.equal(result.data.data.pending, 3);
  assert.equal(result.data.data.since.toISOString(), '2026-10-25T00:00:00.000Z');
  const owned = f.queries.find(([kind]) => kind === 'leads')[1];
  assert.equal(owned.colid, 42); assert.equal(owned.counselloremail.source, '^me@example\\.com$');
  assert.equal(owned.$or[0].academicyear, '2026-27');
  const tasks = f.queries.find(([kind]) => kind === 'tasks')[1];
  assert.equal(tasks.colid, 42); assert.equal(tasks.leadid.$in[0], 'own-lead'); assert.equal(tasks.status.$in.join(','), 'Open,Pending');
  assert.ok(f.queries.find(([kind]) => kind === 'count')[1].$and[1].$or[0].counsellorassignedat.$gt instanceof Date);
});
test('no year only loads master years and an unknown staff user cannot read the dashboard', async () => {
  const f = fixture(), result = await f.invoke('get', '/');
  assert.equal(result.data.years[0], '2026-27'); assert.equal(f.queries.some(([kind]) => kind === 'leads'), false);
  assert.equal((await fixture({ validUser: false }).invoke('get', '/', { academicyear: '2026-27' })).status, 400);
});
test('sign-in recording uses verified token identity and never changes account expiry', async () => {
  const f = fixture(); await f.invoke('post', '/login', { token: 'signed-token', colid: 999, user: 'spoof@example.com' });
  const [query, update] = f.writes[0];
  assert.equal(query.tokenhash.length, 64); assert.equal(update.$setOnInsert.colid, 42); assert.equal(update.$setOnInsert.email, 'me@example.com');
  assert.equal(update.$setOnInsert.lastlogin, undefined);
});
test('admitted report always applies admitted and owned-year conditions, with no mutation', async () => {
  const f = fixture(), result = await f.invoke('get', '/admitted', { academicyear: '2026-27', search: 'Ann' });
  assert.equal(result.status, 200);
  const query = f.queries.find(([kind]) => kind === 'report')[1];
  assert.equal(query.$and[0].colid, 42); assert.equal(query.$and[0].counselloremail.source, '^me@example\\.com$');
  assert.equal(query.$and[1].$or[0].admitted, 'Yes'); assert.equal(f.writes.length, 0);
});
test('pending tasks are restricted to own leads and status updates cannot change task content', async () => {
  const f = fixture(); await f.invoke('get', '/tasks', { academicyear: '2026-27' });
  const query = f.queries.find(([kind]) => kind === 'tasklist')[1];
  assert.equal(query.leadid.$in[0], 'own-lead'); assert.equal(query.status.$in.join(','), 'Open,Pending');
  const result = await f.invoke('post', '/tasks/:id/status', { academicyear: '2026-27', status: 'Closed', task: 'tampered', leadid: 'other' }, { id: '111111111111111111111111' });
  assert.equal(result.status, 200); assert.equal(f.writes[0].$set.status, 'Closed'); assert.equal(f.writes[0].$set.task, undefined);
});
test('full lead details cannot open another counselor lead', async () => {
  const f = fixture(), result = await f.invoke('get', '/lead/:id', { academicyear: '2026-27' }, { id: '111111111111111111111111' });
  assert.equal(result.status, 400);
  const query = f.queries.find(([kind]) => kind === 'lead')[1];
  assert.equal(query.colid, 42); assert.equal(query.counselloremail.source, '^me@example\\.com$');
});
test('telecaller summaries and lists use telecaller ownership, role and the applied filters', async () => {
  const f = fixture({ telecaller: true });
  const result = await f.invoke('get', '/', { academicyear: '2026-27', filters: JSON.stringify([{ field: 'source', value: 'Website' }]), dateFrom: '2026-10-01', dateTo: '2026-10-28' });
  assert.equal(result.status, 200);
  const query = f.queries.find(([kind]) => kind === 'leads')[1];
  assert.equal(query.telecalleremail.source, '^me@example\\.com$'); assert.equal(query.counselloremail, undefined); assert.equal(query.$and.length, 2);
  assert.equal(f.queries.find(([kind]) => kind === 'user')[1].role.$in[0].source, '^telecaller$');
});
test('telecallers may change only pipeline and notes, never task status or arbitrary lead fields', async () => {
  const id = '111111111111111111111111', lead = { _id: id, name: 'Ann', email: 'ann@example.com', phone: '123' };
  const f = fixture({ telecaller: true, ownLead: lead });
  assert.equal((await f.invoke('post', '/lead/:id/pipeline', { academicyear: '2026-27', pipeline: 'Interested' }, { id })).status, 200);
  assert.deepEqual(Object.keys(f.writes[0].$set).sort(), ['pipeline','updatedby']);
  assert.equal(f.queries.find(([kind]) => kind === 'lead')[1].telecalleremail.source, '^me@example\\.com$');
  assert.equal((await f.invoke('post', '/lead/:id/pipeline', { academicyear: '2026-27', pipeline: 'Interested', admitted: 'Yes' }, { id })).status, 400);
  assert.equal((await f.invoke('post', '/tasks/:id/status', { academicyear: '2026-27', status: 'Closed' }, { id })).status, 400);
  assert.equal((await f.invoke('post', '/lead/:id/notes', { academicyear: '2026-27', note: 'Called today' }, { id })).status, 200);
  assert.equal(f.writes[1].leadid, id); assert.equal(f.writes[1].colid, 42);
  assert.equal((await f.invoke('post', '/lead/:id/notes', { academicyear: '2026-27', note: 'Edited', noteid: id }, { id })).status, 200);
  assert.equal(f.queries.find(([kind]) => kind === 'noteupdate')[1].leadid, id);
});
test('telecaller cannot modify a lead outside their assignments', async () => {
  const f = fixture({ telecaller: true });
  assert.equal((await f.invoke('post', '/lead/:id/pipeline', { academicyear: '2026-27', pipeline: 'Interested' }, { id: '111111111111111111111111' })).status, 400);
  assert.equal(f.writes.length, 0);
});
