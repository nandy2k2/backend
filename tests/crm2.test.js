const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const { createRequire } = require("node:module");
const schema = require("../Models/crm2ds");
const file = path.join(__dirname, "../controllers/crm2ctlrds.js"), actualRequire = createRequire(file);
const leadData = { name: "Lead", email: "LEAD@example.com", phone: "+91 98765-43210" };
test('wizard save persists authoritative stage/time and rejects skipping a stage', async () => {
  const f = fixture();
  const first = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, wizardstep: 'CRM Details', stage: 'spoof', stagetime: '2000-01-01', wizardcompleted: ['Documents'] });
  assert.equal(first.status, 200);
  assert.equal(f.creates[0].stage, 'Family & Address');
  assert.deepEqual(f.creates[0].wizardcompleted, ['Identity', 'CRM Details']);
  assert.ok(f.creates[0].stagetime.getTime() > Date.parse('2020-01-01'));
  const next = fixture({ existing: { ...f.creates[0], _id: 'lead1' } });
  const invalid = await next.invoke('post', '/leads/save', { colid: 42, id: 'lead1', wizardstep: 'Documents' });
  assert.equal(invalid.status, 400); assert.equal(next.updates.length, 0);
});
test('identity check accepts email and phone without creating a nameless lead', async () => {
  const f = fixture();
  const result = await f.invoke('post', '/leads/check', { colid: 42, email: leadData.email, phone: leadData.phone });
  assert.equal(result.status, 200); assert.equal(result.data.available, true);
  assert.equal(f.creates.length, 0); assert.equal(f.queries.at(-1).colid, 42);
  const duplicate = await fixture({ duplicate: true }).invoke('post', '/leads/check', { colid: 42, ...leadData });
  assert.equal(duplicate.status, 409);
});
test('agent identity check retains the 15 day lock and reclaims only old unadmitted leads', async () => {
  const person = { name: 'Agent', email: 'agent@example.com' };
  for (const [dateadded, admitted, expected] of [[new Date(), 'No', 409], ['2020-01-01', 'Yes', 409], ['2020-01-01', 'No', 200]]) {
    const f = fixture({ counsellor: person, leadsRecords: [{ _id: 'lead1', dateadded, admitted }] });
    const result = await f.invoke('post', '/leads/check', { colid: 42, email: leadData.email, phone: leadData.phone, leadmode: 'agent', user: person.email });
    assert.equal(result.status, expected);
    if (expected === 200) { assert.equal(result.data.reassigned, true); assert.equal(f.updates[0].$set.agentemail, person.email); }
    assert.equal(f.creates.length, 0);
  }
});
test('bulk telecaller assignment derives identity and email from the institution user master', async () => {
  const f = fixture({ counsellor: { name: 'Telecaller', email: 'tele@example.com' } });
  const result = await f.invoke('post', '/leads/bulk-update', { colid: 42, ids: ['111111111111111111111111'], field: 'telecalleremail', value: 'tele@example.com', telecallername: 'Spoof' });
  assert.equal(result.status, 200); assert.equal(f.updates[0].$set.telecallername, 'Telecaller');
  assert.equal(f.updates[0].$set.telecalleremail, 'tele@example.com'); assert.equal(f.queries[0].role.source, '^telecaller$');
  assert.equal(f.queries.at(-1).colid, 42);
});
test('lead master supports inclusive date-added range together with field filters', async () => {
  const f = fixture();
  const result = await f.invoke('get', '/leads', {}, { colid: 42, dateFrom: '2026-10-01', dateTo: '2026-10-28', filters: JSON.stringify([{ field: 'source', value: 'Website' }]) });
  assert.equal(result.status, 200); const query = f.queries.at(-1);
  assert.equal(query.source.source, 'Website'); assert.equal(query.$and[0].$or[0].dateadded.$lt.toISOString(), '2026-10-29T00:00:00.000Z');
});
test('auto assignment is opt-in and only available in lead master', async () => {
  const data = { colid: 42, ...leadData, country: 'India', state: 'Gujarat', city: 'Ahmedabad', programsinterested: [{ academicyear: '2026-27', programcode: 'P1', priority: 1 }] };
  const person = { name: 'Real counselor', email: 'person@example.com' };
  const f = fixture({ counsellor: person, autoMappings: [{ counselloremail: person.email }] });
  const result = await f.invoke('post', '/leads/save', { ...data, autoassign: true });
  assert.equal(result.status, 200); assert.equal(f.creates[0].counselloremail, person.email);
  const off = fixture({ counsellor: person, autoMappings: [{ counselloremail: person.email }] });
  await off.invoke('post', '/leads/save', data);
  assert.equal(off.queries.some(query => query.country && query.programcode), false);
  const mine = fixture({ counsellor: person });
  await mine.invoke('post', '/leads/save', { ...data, autoassign: true, leadmode: 'my', user: person.email });
  assert.equal(mine.creates[0].counselloremail, person.email);
  assert.equal(mine.queries.some(query => query.country && query.programcode), false);
});
test('no matching counselor produces a warning and preserves existing assignment', async () => {
  const f = fixture({ existing: { ...leadData, counselloremail: 'existing@example.com', counsellorname: 'Existing' } });
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, id: 'lead1', autoassign: true, counselloremail: 'ignored@example.com' });
  assert.equal(result.status, 200); assert.match(result.data.assignmentwarning, /No matching counselor found/);
  assert.equal(f.updates[0].counselloremail, undefined);
});
test('interested programs are scoped, canonicalized and deduplicated', async () => {
  const f = fixture();
  const choice = { academicyear: '2026-27', programcode: '012', program: 'Spoof' };
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, programsinterested: [choice, choice] });
  assert.equal(result.status, 200); assert.equal(f.creates[0].programsinterested.length, 1);
  assert.equal(f.creates[0].programsinterested[0].program, 'Master program');
  assert.equal(f.queries.find(query => query.year)?.colid, 42);
  const invalid = fixture({ masterExists: false });
  assert.equal((await invalid.invoke('post', '/leads/save', { colid: 42, ...leadData, programsinterested: [choice] })).status, 400);
});
test('lead address validates the complete scoped country/state/city combination', async () => {
  const f = fixture();
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, country: 'India', state: 'Gujarat', city: 'Ahmedabad' });
  assert.equal(result.status, 200); assert.equal(f.creates[0].country, 'India');
  const addressQuery = f.queries.find(query => query.country);
  assert.equal(addressQuery.colid, 42); assert.equal(addressQuery.state.source, '^Gujarat$'); assert.equal(addressQuery.city.source, '^Ahmedabad$');
  const bad = fixture({ addressExists: false });
  assert.equal((await bad.invoke('post', '/leads/save', { colid: 42, ...leadData, country: 'India', state: 'Other', city: 'Ahmedabad' })).status, 400);
});
test('lead creation fixes source and date and excludes notification and biometric fields', async () => {
  const f = fixture();
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, addedby: 'API', dateadded: '2000-01-01', biometricid: 'secret', notification: 'Yes' });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].addedby, 'Counselor');
  assert.ok(new Date(f.creates[0].dateadded).getTime() > Date.now() - 60000);
  assert.equal(f.creates[0].biometricid, undefined); assert.equal(f.creates[0].notification, undefined);
});
test('My leads creation derives counselor from User and owned list cannot override owner with filters', async () => {
  const person = { name: 'Counselor', email: 'counselor@example.com' };
  const f = fixture({ counsellor: person });
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, leadmode: 'my', user: person.email, counselloremail: 'someone@example.com' });
  assert.equal(result.status, 200); assert.equal(f.creates[0].counselloremail, person.email);
  const list = await f.invoke('get', '/leads', {}, { colid: 42, user: person.email, leadmode: 'my', filters: JSON.stringify([{ field: 'counselloremail', value: 'someone@example.com' }]) });
  assert.equal(list.status, 200);
  assert.equal(f.queries.at(-1).counselloremail.source, '^counselor@example\\.com$');
});
test('Agent new lead bypasses Agent master and binds the signed-in User', async () => {
  const person = { name: 'Agent User', email: 'agent@example.com' };
  const f = fixture({ counsellor: person });
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, leadmode: 'agent', user: person.email, agentemail: 'spoof@example.com' });
  assert.equal(result.status, 200); assert.equal(f.creates[0].agentemail, person.email);
  assert.equal(f.creates[0].agentname, person.name); assert.equal(f.creates[0].addedby, 'Agent');
});
test('Agent duplicate rules block fresh, admitted, ambiguous or undated leads and reclaim old unadmitted only', async () => {
  const person = { name: 'Agent User', email: 'agent@example.com' };
  const old = { _id: '111111111111111111111111', admitted: 'No', dateadded: new Date(Date.now() - 16 * 86400000), agentemail: 'old@example.com' };
  for (const records of [[{ ...old, dateadded: new Date() }], [{ ...old, admitted: 'Yes' }], [{ ...old, admissionstatus: 'Admitted' }], [old, old], [{ ...old, dateadded: null }]]) {
    const f = fixture({ counsellor: person, leadsRecords: records });
    const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, leadmode: 'agent', user: person.email });
    assert.equal(result.status, 409); assert.equal(f.updates.length, 0);
  }
  const f = fixture({ counsellor: person, leadsRecords: [old] });
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, leadmode: 'agent', user: person.email });
  assert.equal(result.status, 200); assert.equal(result.data.reassigned, true);
  assert.equal(f.updates[0].$set.agentemail, person.email);
  assert.equal(f.updates[0].$set.dateadded, undefined);
});
test('owned workspaces reject updates to another owner lead', async () => {
  const f = fixture({ counsellor: { name: 'Me', email: 'me@example.com' }, existing: { ...leadData, agentemail: 'other@example.com' } });
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, id: 'lead1', leadmode: 'agent', user: 'me@example.com' });
  assert.equal(result.status, 403); assert.equal(f.updates.length, 0);
});
test('telecaller identity is validated and resolved from User', async () => {
  const f = fixture({ counsellor: { name: 'Telecaller', email: 'tele@example.com' } });
  const result = await f.invoke('post', '/leads/save', { colid: 42, ...leadData, telecalleremail: 'tele@example.com', telecallername: 'Spoof' });
  assert.equal(result.status, 200); assert.equal(f.creates[0].telecallername, 'Telecaller');
});
test("subjectwise education persists numeric marks and rejects impossible marks", async () => {
  const f = fixture();
  const education = [{ level: "12th", board: "CBSE", subjects: [{ subject: "Physics", obtained: "85", total: "100", grade: "A" }] }];
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, education });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].education[0].subjects[0].obtained, 85);
  assert.equal(new schema.Lead({ colid: 42, ...leadData, emailkey: "lead@example.com", phonekey: "919876543210", education }).validateSync(), undefined);
  education[0].subjects[0].obtained = "101";
  const invalid = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, education });
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.message, /cannot exceed/);
});
test("education retains missing numeric marks and cannot carry managed fields", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, education: [{ level: "10th", colid: 99, subjects: [{ subject: "English", obtained: "", total: null, grade: "A" }] }] });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].education[0].colid, undefined);
  assert.equal(f.creates[0].education[0].subjects[0].obtained, null);
});
const lean = value => ({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });
function fixture({ duplicate = false, existing = null, counsellor = null, createError = null, awsConfig = null, office = null, masterExists = true, agent = null, leadsRecords = [], addressExists = true, autoMappings = [] } = {}) {
  const queries = [], creates = [], updates = [], uploads = [], aggregations = [], masterCreates = [], taskEvents = [];
  const Lead = {
    find: query => { queries.push(query); return lean(leadsRecords); },
    countDocuments: async query => { queries.push(query); return leadsRecords.length; },
    schema: schema.Lead.schema,
    exists: async query => { queries.push(query); return duplicate; },
    create: async payload => { if (createError) throw createError; creates.push(payload); return { _id: "lead1", ...payload }; },
    findOne: query => { queries.push(query); return lean(existing); },
    findOneAndUpdate: async (query, payload) => { queries.push(query); updates.push(payload); return payload.$set ? { _id: query._id, name: "Lead", pipeline: payload.$set.pipeline, followupdate: payload.$set.followupdate } : payload; },
    updateMany: async (query, payload) => { queries.push(query); updates.push(payload); return { matchedCount: 2, modifiedCount: 2 }; },
    updateOne: async (query, payload) => { queries.push(query); updates.push(payload); return { modifiedCount: 1 }; },
    aggregate: async pipeline => { aggregations.push(pipeline); return [{ data: [], total: 0 }]; },
    deleteMany: async query => { queries.push(query); return { deletedCount: 1 }; }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) {
    if (name === "../Models/crm2ds") return { ...schema, Lead, masterModels: Object.fromEntries(Object.keys(schema.masters).map(key => [key, { create: async payload => { masterCreates.push(payload); return payload; }, exists: async query => { queries.push(query); return masterExists; }, findOne: query => { queries.push(query); return lean(key === "admissionoffice" ? office : key === "agent" ? agent : null); } }])) };
    if (name === "../Models/user") return { schema: require("../Models/user").schema, findOne: query => { queries.push(query); return lean(counsellor); } };
    if (name === '../Models/crm2configurationds') return { Address: { exists: async query => { queries.push(query); return addressExists; } } };
    if (name === '../Models/mprograms') return { findOne: query => { queries.push(query); return lean(masterExists ? { program: 'Master program', programcode: query.programcode } : null); } };
    if (name === '../Models/crm2programds') return { Mapping: { find: query => { queries.push(query); return lean(autoMappings); } } };
    if (name === '../services/crm2FollowupTask') return { syncFollowupTask: async (...args) => taskEvents.push(['sync', ...args]), closeFollowupTasks: async (...args) => taskEvents.push(['close', ...args]) };
    if (name === "../Models/awsconfig") return { findOne: query => { queries.push(query); return lean(awsConfig); } };
    if (name === "aws-sdk") return { S3: class { putObject(payload) { uploads.push(payload); return { promise: async () => ({}) }; } } };
    return actualRequire(name);
  } });
  const invoke = async (method, route, body = {}, query = {}, params = {}, file) => {
    const layer = module.exports.stack.find(item => item.route?.path === route && item.route.methods[method]);
    let status = 200, data;
    await layer.route.stack.at(-1).handle({ body, query, params, file }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  };
  return { queries, creates, updates, uploads, aggregations, masterCreates, taskEvents, invoke };
}
test('merge search requires year/name and only searches scoped name matches, excluding credentials', async () => {
  const f = fixture({ leadsRecords: [{ _id: '111111111111111111111111', name: 'Ann', password: 'secret', emailkey: 'secret', interactions: [{ details: 'Called' }] }] });
  assert.equal((await f.invoke('get', '/leads/merge-candidates', {}, { colid: 42, name: 'Ann' })).status, 400);
  const result = await f.invoke('get', '/leads/merge-candidates', {}, { colid: 42, academicyear: '2026-27', name: 'Ann.*' });
  assert.equal(result.status, 200); assert.equal(f.queries[0].colid, 42); assert.equal(f.queries[0].academicyear, '2026-27');
  assert.equal(f.queries[0].name.source, 'Ann\\.\\*');
  assert.equal(result.data.data[0].password, undefined); assert.equal(result.data.data[0].emailkey, undefined); assert.equal(result.data.data[0].interactions[0].details, 'Called');
});
test('merge retains primary and only deactivates other matching institution/year leads', async () => {
  const ids = ['111111111111111111111111', '222222222222222222222222'];
  const f = fixture({ leadsRecords: ids.map(_id => ({ _id })) });
  const result = await f.invoke('post', '/leads/merge', { colid: 42, academicyear: '2026-27', name: 'Ann', ids, primaryid: ids[0], user: 'admin' });
  assert.equal(result.status, 200); assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].$set.active, 'No');
  const query = f.queries.at(-1); assert.equal(query.colid, 42); assert.equal(query.academicyear, '2026-27');
  assert.equal(query._id.$in.length, 1); assert.equal(query._id.$in[0], ids[1]);
  assert.equal((await fixture().invoke('post', '/leads/merge', { colid: 42, academicyear: '2026-27', name: 'Ann', ids, primaryid: ids[0] })).status, 409);
  assert.equal((await f.invoke('post', '/leads/merge', { colid: 42, academicyear: '2026-27', name: 'Ann', ids, primaryid: '333333333333333333333333' })).status, 400);
});
test('lead master active tab is applied after dynamic filters and cannot be overridden by them', async () => {
  const f = fixture();
  await f.invoke('get', '/leads', {}, { colid: 42, active: 'No', filters: JSON.stringify([{ field: 'active', value: 'Yes' }]) });
  assert.ok(f.queries.every(query => query.colid === 42 && query.active === 'No'));
});
test("removed lead fields are absent from metadata and cannot be saved", async () => {
  const removed = ["abcid", "rollno", "dob", "birthdate", "dateofbirth", "customFields", "admissionapplicationid"];
  for (const field of removed) assert.equal(schema.fields.some(item => item.field === field), false);
  const f = fixture();
  await f.invoke("post", "/leads/save", { colid: 42, ...leadData, ...Object.fromEntries(removed.map(field => [field, "Ignored"])) });
  for (const field of removed) assert.equal(f.creates[0][field], undefined);
});
test("agent master saves requested fields with normalized email and institution scope", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/masters/:kind/save", { colid: 42, name: "Agent", email: "AGENT@EXAMPLE.COM", phone: "1234567890", pan: "PAN", gst: "GST", address: "Address", state: "State", country: "India" }, {}, { kind: "agent" });
  assert.equal(result.status, 200);
  assert.equal(f.masterCreates[0].email, "agent@example.com");
  assert.equal(f.masterCreates[0].colid, 42); assert.equal(f.masterCreates[0].country, "India");
});
test("lead agent name and email are resolved from the scoped master, not client text", async () => {
  const f = fixture({ agent: { name: "Real agent", email: "agent@example.com" } });
  assert.equal((await f.invoke("post", "/leads/save", { colid: 42, ...leadData, agentname: "Forged", agentemail: "AGENT@example.com" })).status, 200);
  assert.equal(f.creates[0].agentname, "Real agent"); assert.equal(f.creates[0].agentemail, "agent@example.com");
  assert.equal(f.queries.at(-1).colid, 42);
  const invalid = fixture(); assert.equal((await invalid.invoke("post", "/leads/save", { colid: 42, ...leadData, agentemail: "foreign@example.com" })).status, 400);
});
test("education records retain overall marks and grade with subjectwise marks", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, education: [{ level: "12th", marks: "450", grade: "A", subjects: [{ subject: "Maths", obtained: 90, total: 100, grade: "A" }] }] });
  assert.equal(result.status, 200); assert.equal(f.creates[0].education[0].marks, 450); assert.equal(f.creates[0].education[0].grade, "A");
});
test("basic lead needs only identity fields, not User login or academic requirements", () => {
  const lead = new schema.Lead({ colid: 42, ...leadData, emailkey: "lead@example.com", phonekey: "919876543210" });
  assert.equal(lead.validateSync(), undefined);
  for (const field of ["program", "programcode", "semester", "Major", "Minor", "MDC", "IDC", "VAC", "SEC"]) assert.equal(schema.Lead.schema.path(field), undefined);
  assert.ok(schema.Lead.schema.indexes().some(([index, options]) => index.colid && index.emailkey && options.unique));
  assert.ok(schema.Lead.schema.indexes().some(([index, options]) => index.colid && index.phonekey && options.unique));
});
test("lead creation normalizes identities, ignores excluded fields and enforces institution scope", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, program: "Ignored", semester: "1", user: "admin@example.com" });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].email, "lead@example.com");
  assert.equal(f.creates[0].phonekey, "919876543210");
  assert.equal(f.creates[0].program, undefined);
  assert.equal(f.queries[0].colid, 42);
});
test("duplicate email OR phone stops creation with 409", async () => {
  const f = fixture({ duplicate: true });
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData });
  assert.equal(result.status, 409);
  assert.match(result.data.message, /Duplicate found/);
  assert.equal(f.creates.length, 0);
  assert.equal(f.queries[0].$or.length, 2);
});
test("counsellor name is derived server-side from scoped email", async () => {
  const f = fixture({ counsellor: { name: "Real counsellor", email: "c@example.com" } });
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, counselloremail: "c@example.com", counsellorname: "Forged" });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].counsellorname, "Real counsellor");
  assert.equal(f.queries.at(-1).colid, 42);
});
test("foreign lead cannot be edited and college ID is mandatory", async () => {
  const f = fixture();
  assert.equal((await f.invoke("post", "/leads/save", { colid: 42, ...leadData, id: "foreign" })).status, 404);
  assert.equal((await f.invoke("post", "/leads/save", leadData)).status, 400);
  assert.equal(f.creates.length, 0);
});
test("bulk upload rejects duplicates and reports row errors", async () => {
  const f = fixture({ duplicate: true });
  const result = await f.invoke("post", "/bulk/:entity", { colid: 42, rows: [leadData] }, {}, { entity: "leads" });
  assert.equal(result.status, 200);
  assert.equal(result.data.saved, 0);
  assert.equal(result.data.errors[0].row, 2);
  assert.equal(f.creates.length, 0);
});
test("bulk delete remains colid scoped", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/delete", { colid: 42, ids: ["lead1", "lead2"] });
  assert.equal(result.status, 200);
  assert.equal(f.queries[0].colid, 42);
});
test("optional lead password is hashed, never returned, and cannot be searched from User", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, password: "example-password" });
  assert.equal(result.status, 200);
  assert.match(f.creates[0].password, /^scrypt:/);
  assert.equal(result.data.data.password, undefined);
  assert.equal((await f.invoke("get", "/field-options", {}, { colid: 42, field: "password" })).status, 400);
});
test("database duplicate race returns a conflict without advancing the lead", async () => {
  const f = fixture({ createError: { code: 11000 } });
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData });
  assert.equal(result.status, 409);
  assert.match(result.data.message, /Duplicate found/);
});
test("updating a lead excludes its own identity from duplicate matching", async () => {
  const f = fixture({ existing: { _id: "lead1", ...leadData, colid: 42 } });
  const result = await f.invoke("post", "/leads/save", { colid: 42, id: "lead1", comments: "Follow up" });
  assert.equal(result.status, 200);
  assert.equal(f.queries[1]._id.$ne, "lead1");
  assert.equal(f.updates[0].comments, "Follow up");
  assert.equal(f.updates[0].colid, 42);
});
test("updated lead metadata removes unwanted fields and adds education, enums and follow-up", () => {
  for (const field of ["regno", "scholarnumber", "authenticator", "excluded", "role", "expopushtoken", "profileapprovalstatus", "profileapprovalcomments", "admissionyear", "section", "isfinalyear", "eligibilityname", "designation", "regulation", "AEC", "othersub", "merit", "obtain", "bonus", "weightage", "ncctype", "institution", "specialization1", "specialization2"]) {
    assert.equal(schema.fields.some(item => item.field === field), false, field);
  }
  for (const field of ["active", "followupdate", "12thinstitution", "12thpassingyear", "12thgrade", "12thmarks", "12thboard", "10thinstitution", "10thpassingyear", "10thgrade", "10thmarks", "10thboard"]) assert.ok(schema.fields.some(item => item.field === field), field);
  assert.deepEqual(schema.fields.find(item => item.field === "gender").options, ["Male", "Female", "Not specified"]);
  assert.deepEqual(schema.fields.find(item => item.field === "category").options, ["SC", "ST", "General", "OBC"]);
  for (const field of ["active", "samestate", "isdisabled"]) assert.deepEqual(schema.fields.find(item => item.field === field).options, ["Yes", "No"]);
  assert.ok(schema.masterModels.mediumofinstruction && schema.masterModels.quota && schema.masterModels.document);
});
test("CRM category and demographic category save independently with scoped documents", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, crmcategory: "Interested", category: "General", quota: "Management", Mediumofinstruction: "English", active: "Yes", followupdate: "2026-10-20", documents: [{ documentname: "Marksheet", url: "https://example.com/marks.pdf" }] });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].crmcategory, "Interested");
  assert.equal(f.creates[0].category, "General");
  assert.ok(f.queries.some(query => query.colid === 42 && query.name === "Interested"));
  assert.ok(f.queries.some(query => query.colid === 42 && query.name === "Marksheet"));
  assert.equal(f.queries.some(query => query.name === "General"), false);
});
test("legacy CRM category is preserved in crmcategory when saved", async () => {
  const f = fixture({ existing: { _id: "lead1", ...leadData, category: "Interested", colid: 42 } });
  const result = await f.invoke("post", "/leads/save", { colid: 42, id: "lead1", comments: "Updated" });
  assert.equal(result.status, 200);
  assert.equal(f.updates[0].crmcategory, "Interested");
  assert.equal(f.updates[0].category, null);
});
test("AWS photo upload uses the institution configuration and a scoped object key", async () => {
  const f = fixture({ awsConfig: { username: "key", password: "secret", bucket: "test-bucket", region: "ap-south-1" } });
  const result = await f.invoke("post", "/upload", { colid: 42, kind: "photo" }, {}, {}, { originalname: "photo.png", mimetype: "image/png", buffer: Buffer.from("image") });
  assert.equal(result.status, 200);
  assert.equal(f.queries[0].colid, 42);
  assert.match(f.uploads[0].Key, /^42\/crm2\//);
  assert.equal(f.uploads[0].ContentType, "image/png");
  assert.match(result.data.url, /^https:\/\/test-bucket\.s3\.ap-south-1\.amazonaws.com\/42\/crm2\//);
});
test("non-image files cannot be uploaded as lead photos", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/upload", { colid: 42, kind: "photo" }, {}, {}, { originalname: "file.pdf", mimetype: "application/pdf", buffer: Buffer.from("pdf") });
  assert.equal(result.status, 400);
  assert.equal(f.uploads.length, 0);
});
test("an old CRM category named General is not confused with the new demographic category", async () => {
  const f = fixture({ existing: { _id: "lead1", ...leadData, category: "General", colid: 42 } });
  await f.invoke("post", "/leads/save", { colid: 42, id: "lead1", comments: "Updated" });
  assert.equal(f.updates[0].crmcategory, "General");
  assert.equal(f.updates[0].category, null);
  assert.equal(f.updates[0].crm2profileversion, 2);
});
const leadid = "507f1f77bcf86cd799439011", officeid = "507f1f77bcf86cd799439012", interactionid = "507f1f77bcf86cd799439013";
test("office ID/name and campus counsellor email/name are resolved in this institution", async () => {
  const f = fixture({ office: { _id: officeid, name: "Main office" }, counsellor: { name: "Campus counsellor", email: "campus@example.com" } });
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, admissionofficeid: officeid, admissionoffice: "Forged office", campuscounsellor: "Forged name", campuscounseloremail: "campus@example.com" });
  assert.equal(result.status, 200);
  assert.equal(f.creates[0].admissionoffice, "Main office");
  assert.equal(f.creates[0].admissionofficeid, officeid);
  assert.equal(f.creates[0].campuscounsellor, "Campus counsellor");
  assert.ok(f.queries.every(query => query.colid === 42));
});
test("a foreign admission office cannot be assigned", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/save", { colid: 42, ...leadData, admissionofficeid: officeid });
  assert.equal(result.status, 400);
  assert.equal(f.creates.length, 0);
});
test("interaction history and current pipeline/follow-up are updated atomically", async () => {
  const f = fixture();
  const result = await f.invoke("post", "/interactions/save", { colid: 42, leadid, details: "Discussed admission", mode: "Phone", pipeline: "Interested", nextfollowupdate: "2026-10-22", user: "staff@example.com" });
  assert.equal(result.status, 200);
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].$push.interactions.details, "Discussed admission");
  assert.equal(f.updates[0].$set.pipeline, "Interested");
  assert.equal(f.updates[0].$set.followupdate.toISOString(), "2026-10-22T00:00:00.000Z");
  assert.equal(f.taskEvents[0][0], 'sync');
  assert.equal(f.taskEvents[0][1], 42);
  assert.equal(String(f.taskEvents[0][3]), String(f.updates[0].$push.interactions._id));
  assert.equal(f.queries.at(-1).colid, 42);
  assert.equal(f.queries.at(-1)._id, leadid);
});
test("interaction history reads and deletion remain scoped to the selected lead", async () => {
  const f = fixture();
  assert.equal((await f.invoke("get", "/interactions", {}, { colid: 42, leadid, limit: 25 })).status, 200);
  assert.equal(f.aggregations[0][0].$match.colid, 42);
  assert.equal(String(f.aggregations[0][0].$match._id), leadid);
  await f.invoke("post", "/interactions/delete", { colid: 42, leadid, ids: [interactionid] });
  assert.equal(f.queries.at(-1)._id, leadid);
  assert.equal(f.queries.at(-1).colid, 42);
});
test("interaction refuses unknown modes and stages", async () => {
  const f = fixture({ masterExists: false });
  const result = await f.invoke("post", "/interactions/save", { colid: 42, leadid, details: "Test", mode: "Unknown", pipeline: "Unknown" });
  assert.equal(result.status, 400);
  assert.equal(f.updates.length, 0);
});
for (const [field, value] of [["pipeline", "Interested"], ["type", "Walk-in"], ["source", "Website"], ["active", "No"], ["admissionstatus", "Admitted"]]) test(`bulk ${field} only updates selected leads inside colid`, async () => {
  const f = fixture();
  const result = await f.invoke("post", "/leads/bulk-update", { colid: 42, ids: [leadid], field, value });
  assert.equal(result.status, 200);
  assert.equal(f.queries.at(-1).colid, 42);
  assert.equal(f.queries.at(-1)._id.$in[0], leadid);
  assert.equal(f.updates[0].$set[field], value);
});
test("bulk counsellor derives the name from User and disallows unrequested fields", async () => {
  const f = fixture({ counsellor: { name: "Staff", email: "staff@example.com" } });
  const result = await f.invoke("post", "/leads/bulk-update", { colid: 42, ids: [leadid], field: "counselloremail", value: "staff@example.com" });
  assert.equal(result.status, 200);
  assert.equal(f.updates[0].$set.counsellorname, "Staff");
  assert.equal((await f.invoke("post", "/leads/bulk-update", { colid: 42, ids: [leadid], field: "password", value: "bad" })).status, 400);
});
