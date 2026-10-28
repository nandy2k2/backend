const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const L1 = '111111111111111111111111', L2 = '222222222222222222222222', M1 = '333333333333333333333333', M2 = '444444444444444444444444', A1 = '555555555555555555555555';
function setup({ noMappings = false, foreign = false } = {}) {
  const routes = {}, calls = [];
  const people = [{ name: 'One', email: 'one@example.com' }, { name: 'Two', email: 'two@example.com' }];
  const mappings = noMappings ? [] : [{ _id: M1, program: 'Science', programcode: 'P1', counsellorname: 'One', counselloremail: people[0].email, location: 'North' }, { _id: M2, program: 'Science', programcode: 'P1', counsellorname: 'Two', counselloremail: people[1].email }];
  const chain = (value, model, query) => ({ select(fields) { calls.push({ model, query, select: fields }); return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });
  const assignment = { _id: A1, leadid: L1, academicyear: '2026-27', programcode: 'P1', counselloremail: 'one@example.com', interactions: [] };
  const Mapping = {
    findOne(query) { calls.push({ model: 'mapping', query }); return chain(mappings.find(row => row._id === query._id && row.programcode === query.programcode) || null); },
    find(query) { calls.push({ model: 'mapping', query }); return chain(mappings); },
    async create(data) { calls.push({ model: 'mapping', create: data }); return data; },
    async findOneAndUpdate(query, update) { calls.push({ model: 'mapping', query, update }); return update.$set; },
    async deleteMany(query) { calls.push({ model: 'mapping', query }); return { deletedCount: 1 }; }
  };
  const Lead = {
    async updateOne(query, update) { calls.push({ model: 'lead', query, update }); return { modifiedCount: 1 }; },
    async updateMany(query, update) { calls.push({ model: 'lead', query, update }); return { modifiedCount: 1 }; },
    find(query) { calls.push({ model: 'lead', query }); return chain(query._id?.$in ? query._id.$in.map(_id => ({ _id, name: 'Lead', pipeline: 'New' })) : [{ _id: L1 }], 'lead', query); },
    findOne(query) { calls.push({ model: 'lead', query }); return chain({ _id: L1, name: 'Lead' }); },
    async distinct(field, query) { calls.push({ model: 'lead', query }); return ['2026-27']; }
  };
  const Assignment = {
    async updateMany(query, update) { calls.push({ model: 'assignment', query, update }); return { modifiedCount: 1 }; },
    async aggregate(pipeline) { calls.push({ model: 'assignment', aggregate: pipeline }); return [{ _id: 'one@example.com', count: 5 }, { _id: 'two@example.com', count: 0 }]; },
    async findOneAndUpdate(query, update, options) { calls.push({ model: 'assignment', query, update, options }); return { ...assignment, ...update.$set }; },
    find(query) { calls.push({ model: 'assignment', query }); return chain(foreign ? [] : [assignment], 'assignment', query); },
    findOne(query) { calls.push({ model: 'assignment', query }); return chain(foreign ? null : assignment); },
    async exists(query) { calls.push({ model: 'assignment', query }); return query._id?.$ne ? false : !foreign; },
    async countDocuments(query) { calls.push({ model: 'assignment', query }); return 1; },
    async distinct(field, query) { calls.push({ model: 'assignment', query }); return field === 'leadid' ? [L1] : ['Science']; }
  };
  const masters = Object.fromEntries(['pipeline', 'case', 'interactionmode'].map(field => [field, { exists: async query => { calls.push({ model: field, query }); return query.name !== 'Unknown'; } }]));
  const deps = {
    '../Models/crm2programds': { Mapping, Assignment }, '../Models/crm2ds': { Lead, masterModels: masters },
    '../Models/mprograms': { findOne: query => { calls.push({ model: 'program', query }); return chain({ program: 'Science', programcode: query.programcode }); }, find: query => { calls.push({ model: 'program', query }); return chain([{ program: 'Science', programcode: 'P1' }, { program: 'Science', programcode: 'P1' }]); }, distinct: async (_, query) => { calls.push({ model: 'program', query }); return ['2025-26', '2026-27']; } },
    '../utils/crm2ProgramYearIndex': async () => {},
    '../utils/crm2DashboardScope': require('../utils/crm2DashboardScope'),
    '../utils/crm2MappingAddressIndex': async () => {},
    '../Models/crm2configurationds': { Address: { exists: async query => { calls.push({ model: 'address', query }); return true; } } },
    './crm2programreportctlrds': { options: async () => {}, report: async () => {} },
    '../Models/user': { exists: async query => { calls.push({ model: 'user', query }); return true; }, find: query => { calls.push({ model: 'user', query }); return chain(people); }, findOne: query => { calls.push({ model: 'user', query }); return chain(people[0]); } }
  };
  const module = { exports: {} };
  deps['../Models/mprograms'].exists = async query => { calls.push({ model: 'program', query }); return true; };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/crm2programctlrds.js'), 'utf8'), { module, require: name => name === 'express' ? { Router: () => ({ get: (route, fn) => { routes[`GET ${route}`] = fn; }, post: (route, fn) => { routes[`POST ${route}`] = fn; } }) } : deps[name] });
  const call = async (route, data = {}, params = {}) => { if (route === 'POST /assign') data = { academicyear: '2026-27', ...data }; let status = 200, body; await routes[route]({ query: data, body: data, params }, { status(value) { status = value; return this; }, json(value) { body = value; } }); return { status, body }; };
  return { call, calls };
}
test('bulk Active update validates Yes/No and restricts programwise selection to owned assignments', async () => {
  const f = setup();
  assert.equal((await f.call('POST /bulk-action', { colid: 42, user: 'one@example.com', mode: 'my', ids: [A1], action: 'active', active: 'No' })).status, 200);
  const write = f.calls.find(row => row.model === 'lead' && row.update);
  assert.equal(write.query.colid, 42); assert.equal(String(write.query._id.$in[0]), L1); assert.equal(write.update.$set.active, 'No');
  assert.equal((await setup().call('POST /bulk-action', { colid: 42, user: 'one@example.com', mode: 'master', ids: [L1], action: 'active', active: 'INVALID' })).status, 400);
  assert.equal((await setup({ foreign: true }).call('POST /bulk-action', { colid: 42, user: 'one@example.com', mode: 'my', ids: [A1], action: 'active', active: 'Yes' })).status, 403);
});
test('counselor mapping saves country/state/city and validates against scoped Address master', async () => {
  const f = setup();
  const result = await f.call('POST /mappings/save', { colid: 42, user: 'one@example.com', programcode: 'P1', counselloremail: 'one@example.com', country: 'India', state: 'Gujarat', city: 'Ahmedabad' });
  assert.equal(result.status, 200);
  const created = f.calls.find(call => call.model === 'mapping' && call.create).create;
  assert.equal(created.country, 'India'); assert.equal(created.city, 'Ahmedabad');
  const checked = f.calls.find(call => call.model === 'address').query;
  assert.equal(checked.colid, 42); assert.equal(checked.state.source, '^Gujarat$');
  assert.equal((await f.call('POST /mappings/save', { colid: 42, programcode: 'P1', counselloremail: 'one@example.com', city: 'Ahmedabad' })).status, 400);
});
test('master transfer validates mapped program counselor and updates only selected program assignment and lead counselor', async () => {
  const f = setup();
  const result = await f.call('POST /bulk-action', { colid: 42, user: 'one@example.com', mode: 'master', ids: [L1, L2], action: 'transfer', academicyear: '2026-27', programcode: 'P1', mappingid: M2 });
  assert.equal(result.status, 200); assert.equal(result.body.saved, 2);
  const writes = f.calls.filter(row => row.model === 'assignment' && row.update);
  assert.equal(writes.length, 2); assert.equal(writes[0].query.academicyear, '2026-27'); assert.equal(writes[0].update.$set.counselloremail, 'two@example.com'); assert.equal(writes[0].update.$set.interactions, undefined);
  assert.equal((await setup().call('POST /bulk-action', { colid: 42, user: 'one@example.com', mode: 'master', ids: [L1], action: 'transfer', academicyear: '2026-27', programcode: 'OTHER', mappingid: M2 })).status, 400);
});
test('programwise transfer updates owned assignment in place and preserves history and academic year', async () => {
  const f = setup();
  const result = await f.call('POST /bulk-action', { colid: 42, user: 'one@example.com', mode: 'my', ids: [A1], action: 'transfer', programcode: 'P1', mappingid: M2 });
  assert.equal(result.status, 200);
  const write = f.calls.find(row => row.model === 'assignment' && row.update);
  assert.equal(write.query._id, A1); assert.equal(write.query.counselloremail, 'one@example.com'); assert.equal(write.options.upsert, false);
  assert.equal(write.update.$set.interactions, undefined); assert.equal(write.update.$set.academicyear, undefined);
});
test('programwise active tabs filter the linked lead while retaining counselor scope', async () => {
  const f = setup();
  await f.call('GET /my-leads', { colid: 42, user: 'one@example.com', active: 'No', filters: JSON.stringify([{ field: 'active', value: 'Yes' }]) });
  const leadQuery = f.calls.find(row => row.model === 'lead' && row.query.active)?.query;
  assert.equal(leadQuery.colid, 42); assert.equal(leadQuery.active, 'No');
  const assignmentQuery = f.calls.find(row => row.model === 'assignment' && row.query)?.query;
  assert.equal(assignmentQuery.counselloremail, 'one@example.com'); assert.equal(assignmentQuery.colid, 42);
});
test('programwise Admitted updates linked institution-scoped lead only after ownership validation', async () => {
  const f = setup();
  assert.equal((await f.call('POST /my-leads/save', { colid: 42, user: 'one@example.com', id: A1, admitted: 'Yes' })).status, 200);
  const write = f.calls.find(row => row.model === 'lead' && row.update);
  assert.equal(write.query.colid, 42); assert.equal(write.query._id, L1); assert.equal(write.update.$set.admitted, 'Yes');
  assert.equal((await setup({ foreign: true }).call('POST /my-leads/save', { colid: 42, user: 'one@example.com', id: A1, admitted: 'Yes' })).status, 404);
  assert.equal((await setup().call('POST /my-leads/save', { colid: 42, user: 'one@example.com', id: A1, admitted: 'Other' })).status, 400);
});
test('mapping validates master data and stores auto-populated name and email scoped to institution', async () => {
  const { call, calls } = setup();
  const result = await call('POST /mappings/save', { colid: 42, programcode: 'P1', counselloremail: 'one@example.com', location: 'North' });
  assert.equal(result.status, 200);
  const saved = calls.find(call => call.create).create;
  assert.equal(saved.program, 'Science'); assert.equal(saved.counselloremail, 'one@example.com'); assert.equal(saved.colid, 42);
  assert.ok(calls.filter(call => call.query).every(call => call.query.colid === 42));
});
test('manual selection must belong to the selected program; repeated assignments use unique upsert key', async () => {
  const { call, calls } = setup();
  const body = { colid: 42, leadids: [L1], programs: [{ programcode: 'P1', mappingid: M1 }] };
  assert.equal((await call('POST /assign', { ...body, programs: [{ programcode: 'P1', mappingid: '999999999999999999999999' }] })).status, 400);
  assert.equal((await call('POST /assign', body)).body.saved, 1);
  assert.equal((await call('POST /assign', body)).body.saved, 1);
  const writes = calls.filter(call => call.model === 'assignment' && call.update);
  assert.equal(writes.length, 2);
  for (const write of writes) { assert.equal(write.query.colid, 42); assert.equal(write.query.academicyear, '2026-27'); assert.equal(write.query.leadid, L1); assert.equal(write.query.programcode, 'P1'); assert.equal(write.options.upsert, true); assert.equal(write.update.$set.counselloremail, 'one@example.com'); }
});
test('auto assignment chooses the least-loaded mapped counselor and never accepts an arbitrary email', async () => {
  const { call, calls } = setup();
  const result = await call('POST /assign', { colid: 42, leadids: [L1, L2], autoassign: true, programs: [{ programcode: 'P1', counselloremail: 'forged@example.com' }] });
  assert.equal(result.body.saved, 2);
  assert.ok(calls.filter(call => call.update).every(call => call.update.$set.counselloremail === 'two@example.com'));
});
test('missing mapping stops assignment before any writes', async () => {
  const { call, calls } = setup({ noMappings: true });
  assert.equal((await call('POST /assign', { colid: 42, leadids: [L1], autoassign: true, programs: [{ programcode: 'P1' }] })).status, 400);
  assert.equal(calls.filter(call => call.update).length, 0);
});
test('own lead list and detail always enforce counselor and institution filters', async () => {
  const { call, calls } = setup();
  assert.equal((await call('GET /my-leads', { colid: 42, user: 'ONE@example.com', filters: JSON.stringify([{ field: 'programcode', value: 'P1' }, { field: 'counselloremail', value: 'two@example.com' }]) })).status, 200);
  assert.equal((await call('GET /my-leads/:id', { colid: 42, user: 'one@example.com' }, { id: A1 })).status, 200);
  for (const call of calls.filter(call => call.model === 'assignment' && call.query)) { assert.equal(call.query.colid, 42); assert.equal(call.query.counselloremail, 'one@example.com'); }
  assert.equal((await call('GET /my-leads', { colid: 42 })).status, 403);
});
test('other counselors cannot open or update an unassigned lead', async () => {
  const { call, calls } = setup({ foreign: true });
  assert.equal((await call('GET /my-leads/:id', { colid: 42, user: 'one@example.com' }, { id: A1 })).status, 404);
  assert.equal((await call('POST /my-leads/save', { colid: 42, user: 'one@example.com', id: A1, pipeline: 'New' })).status, 404);
  assert.equal(calls.filter(call => call.update).length, 0);
});
test('program interaction updates only the owned assignment, not the shared lead', async () => {
  const { call, calls } = setup();
  const result = await call('POST /my-leads/save', { colid: 42, user: 'one@example.com', id: A1, pipeline: 'Interested', case: 'Callback', followupdate: '2026-11-01', mode: 'Phone', details: 'Discussed the course', counselloremail: 'two@example.com' });
  assert.equal(result.status, 200);
  const write = calls.find(call => call.update);
  assert.equal(write.query.counselloremail, 'one@example.com'); assert.equal(write.update.$set.pipeline, 'Interested');
  assert.equal(write.update.$push.interactions.details, 'Discussed the course');
  assert.equal(write.update.$set.counselloremail, undefined);
});
test('filter options are restricted to assigned leads and invalid scope is rejected', async () => {
  const { call, calls } = setup();
  assert.equal((await call('GET /filter-options', { colid: 42, user: 'one@example.com', field: 'source' })).status, 200);
  const query = calls.find(call => call.model === 'lead').query;
  assert.equal(query._id.$in[0], L1); assert.equal(query.colid, 42);
  assert.equal((await call('GET /programs', {})).status, 400);
  assert.equal((await call('GET /filter-options', { colid: 42, user: 'one@example.com', field: 'password' })).status, 400);
});
test('assignment inspection checks the lead and fetches its assignments within the institution', async () => {
  const { call, calls } = setup();
  const result = await call('GET /lead-assignments/:id', { colid: 42, user: 'one@example.com' }, { id: L1 });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  const assignmentQuery = calls.find(call => call.model === 'assignment').query;
  assert.equal(assignmentQuery.colid, 42); assert.equal(assignmentQuery.leadid, L1);
  const leadQuery = calls.find(call => call.model === 'lead').query;
  assert.equal(leadQuery.colid, 42); assert.equal(leadQuery._id, L1);
  assert.equal((await call('GET /lead-assignments/:id', {}, { id: L1 })).status, 400);
  assert.equal((await call('GET /lead-assignments/:id', { colid: 42 }, { id: 'invalid' })).status, 400);
});
test('program choices, master validation, and allocation keys are academic year specific', async () => {
  const { call, calls } = setup();
  assert.equal((await call('GET /academic-years', { colid: 42 })).body.data[0], '2026-27');
  await call('GET /programs', { colid: 42, academicyear: '2026-27' });
  assert.equal(calls.find(call => call.query?.year).query.year, '2026-27');
  assert.equal((await call('POST /assign', { colid: 42, academicyear: '', leadids: [L1], programs: [{ programcode: 'P1', mappingid: M1 }] })).status, 400);
  await call('POST /assign', { colid: 42, academicyear: '2025-26', leadids: [L1], programs: [{ programcode: 'P1', mappingid: M1 }] });
  await call('POST /assign', { colid: 42, academicyear: '2026-27', leadids: [L1], programs: [{ programcode: 'P1', mappingid: M1 }] });
  const writes = calls.filter(call => call.update);
  assert.equal(writes[0].query.academicyear, '2025-26'); assert.equal(writes[1].query.academicyear, '2026-27');
  assert.ok(calls.filter(call => call.model === 'program' && call.query.programcode).every(call => call.query.year));
});
