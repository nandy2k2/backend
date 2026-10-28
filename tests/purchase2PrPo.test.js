const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const mongoose = require('mongoose');
const { availability } = require('../utils/purchase2PrAvailability');
const rules = require('../utils/purchase2PoRules');
const amounts = require('../utils/purchase2Amounts');
test('remaining quantities combine legacy POs and explicit line links without double counting repeated items', () => {
  const lines = [{ _id: 'a', itemid: 'X', quantity: 5 }, { _id: 'b', itemid: 'X', quantity: 5 }];
  const state = availability(lines, [{ poid: 'P1', itemid: 'X', quantity: 7 }], [{ poid: 'P1' }]);
  assert.equal(state.complete, false); assert.equal(state.lines[0].remainingquantity, 0); assert.equal(state.lines[1].remainingquantity, 3);
  assert.equal(availability(lines, [{ poid: 'P1', itemid: 'X', quantity: 10 }], [{ poid: 'P1' }]).complete, true);
  assert.equal(availability(lines, [{ poid: 'P1', itemid: 'X', quantity: 10, prallocation: false }], [{ poid: 'P1' }]).ordered, 0);
  assert.equal(availability(lines, [{ poid: 'P1', itemid: 'X', quantity: 10 }], [{ poid: 'P1', postatus: 'Rejected' }]).complete, false);
});
test('explicit full line allocation completes legacy PRs and submitted financial changes are blocked', () => {
  assert.equal(availability([{ _id: 'a', quantity: 10, allocationstatus: 'Allocated' }], [], []).complete, true);
  for (const postatus of ['Submitted','Approved']) {
    assert.equal(rules.draft({ postatus }), false);
    assert.throws(() => rules.guardHeader({ postatus, terms: 'Old' }, { terms: 'New' }), /locked/);
    assert.throws(() => rules.guardHeader({ postatus }, { postatus: 'Draft' }), /cannot return/);
  }
  assert.equal(rules.draft({ postatus: 'Draft', approvalStatus: 'Pending' }), true);
});
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  let state = {
    prs: [{ _id: 'pr1', colid: 42, prnumber: 'PR1', status: 'Approved', porevision: 0, storeid: 's1' }],
    pritems: [{ _id: 'line1', colid: 42, prnumber: 'PR1', itemid: 'i1', itemcode: 'I1', itemname: 'Paper', unit: 'Ream', quantity: 10 }],
    assignments: [{ _id: 'a1', colid: 42, prnumber: 'PR1', assignedtoemail: 'me@example.com', status: 'Assigned' }],
    pos: [], items: [], vendors: [{ _id: 'v1', colid: 42, vendorname: 'Vendor' }], stores: [{ _id: 's1', colid: 42, storename: 'Central Store', address: 'Campus Road', phone: '123' }], signatures: [], workflows: [{ colid: 42, level: 1, status: 'Active' }]
  };
  const calls = []; let queue = Promise.resolve(), seq = 0;
  const matches = (row, query) => Object.entries(query).every(([key,value]) => value instanceof RegExp ? value.test(String(row[key] || '')) : value && typeof value === 'object' ? value.$in ? value.$in.some(item => String(item) === String(row[key])) : value.$ne !== undefined ? row[key] !== value.$ne : true : String(row[key]) === String(value));
  const chain = value => ({ session() { return this; }, sort() { return this; }, select() { return this; }, lean: async () => copy(value), then(resolve,reject) { return Promise.resolve(value).then(resolve,reject); } });
  const model = key => ({
    find(query) { calls.push([key,query]); return chain(state[key].filter(row => matches(row, query))); },
    findOne(query) { calls.push([key,query]); return chain(state[key].find(row => matches(row,query)) || null); },
    findOneAndUpdate(query, update) { calls.push([key,query]); const row = state[key].find(row => matches(row,query)); if (row) { for (const [field,n] of Object.entries(update.$inc || {})) row[field] = (row[field] || 0) + n; Object.assign(row, update.$set || {}); } return chain(row || null); },
    async updateOne(query,update) { return this.updateMany(query,update); },
    async updateMany(query,update) { calls.push([key,query]); for (const row of state[key].filter(row => matches(row,query))) { Object.assign(row, update.$set || {}); for (const [field,n] of Object.entries(update.$inc || {})) row[field] = (row[field] || 0) + n; } },
    async create(rows) { const data = rows.map(row => ({ _id: `generated${++seq}`, calculationrevision: 0, ...row })); state[key].push(...copy(data)); return data; },
    async insertMany(rows) { return this.create(rows); },
    async deleteMany(query) { state[key] = state[key].filter(row => !matches(row,query)); }
  });
  const models = { storeprrequestds2: model('prs'), storeprrequestitemsds2: model('pritems'), storepoorderds2: model('pos'), storepoitemsds2: model('items'), storepoassignmentds2: model('assignments'), vendords2: model('vendors'), storemasterds2: model('stores'), usersignatureds: model('signatures'), storepoapprovalworkflowds2: model('workflows') };
  const mongo = { Types: mongoose.Types, startSession: async () => ({ endSession: async () => {}, withTransaction: async callback => {
    const operation = queue.then(async () => { const before = copy(state); try { return await callback(); } catch (error) { state = before; throw error; } });
    queue = operation.catch(() => {}); return operation;
  } }) };
  const prModule = { exports: {} }, draftModule = { exports: {} };
  const load = (file,module) => vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../services/${file}.js`),'utf8'), { module, Date, require(name) {
    if (name === 'mongoose') return mongo;
    if (name.startsWith('../Models/')) return models[name.split('/').at(-1)];
    if (name.endsWith('purchase2Amounts')) return amounts;
    if (name.endsWith('purchase2PrAvailability')) return require('../utils/purchase2PrAvailability');
    if (name.endsWith('purchase2PoRules')) return rules;
    if (name === './purchase2PrPo') return prModule.exports;
    if (name === './purchase2PoDraft') return draftModule.exports;
    if (name === './purchase2PoAccess') return { canEdit: () => {}, canApprove: async () => ({ current: { level: 1 } }) };
    throw new Error(name);
  } });
  load('purchase2PrPo',prModule); load('purchase2PoDraft',draftModule);
  const body = quantity => ({ user: 'me@example.com', name: 'Me', assignmentid: 'a1', prnumber: 'PR1', header: { vendorid: 'v1', storeid: 's1' }, items: [{ pritemid: 'line1', quantity, price: 100, gst: 18 }] });
  return { pr: prModule.exports, draft: draftModule.exports, body, actor: { colid: 42, email: 'me@example.com', name: 'Me', admin: true }, state: () => state, calls };
}
test('one atomic creation completes a PR, updates assignment and prevents subsequent duplicate POs', async () => {
  const f = fixture(), created = await f.pr.create(42, f.body(10));
  assert.equal(created.complete, true); assert.equal(f.state().prs[0].status, 'PO Generated'); assert.equal(f.state().assignments[0].status, 'Completed');
  assert.equal(created.header.actualAmount, 1180); assert.equal(created.header.storename, 'Central Store');
  await assert.rejects(f.pr.create(42, f.body(1)), /already allocated/); assert.equal(f.state().pos.length, 1);
});
test('two competing full-quantity attempts cannot commit duplicate allocations', async () => {
  const f = fixture(), results = await Promise.allSettled([f.pr.create(42, f.body(10)), f.pr.create(42, f.body(10))]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(f.state().items.reduce((sum,row) => sum + row.quantity, 0), 10);
});
test('partial allocations remain available and draft quantity edits respect amounts ordered in other POs', async () => {
  const f = fixture(), first = await f.pr.create(42, f.body(4)); await f.pr.create(42, f.body(3));
  assert.equal((await f.pr.read(42,'PR1')).remaining[0].remainingquantity, 3);
  const body = { id: first.header._id, header: { vendorid: 'v1', storeid: 's1', terms: 'Updated terms' }, items: [{ ...first.items[0], quantity: 7 }] };
  const updated = await f.draft.save(f.actor, body); assert.equal(updated.items[0].quantity, 7); assert.equal(updated.header.actualAmount, 826); assert.equal(f.state().prs[0].status, 'PO Generated');
  await assert.rejects(f.draft.save(f.actor, { ...body, items: [{ ...updated.items[0], quantity: 8 }] }), /exceeds the PR/);
  assert.equal(f.state().items.reduce((sum,row) => sum + row.quantity, 0), 10);
});
test('submitted PO edits roll back without changing lines or money', async () => {
  const f = fixture(), created = await f.pr.create(42, f.body(10));
  await f.draft.action(f.actor, { id: created.header._id, action: 'submit' });
  await assert.rejects(f.draft.save(f.actor, { id: created.header._id, header: { vendorid: 'v1', storeid: 's1' }, items: [{ ...created.items[0], price: 999 }] }), /locked/);
  assert.equal(f.state().items[0].price, 100); assert.equal(f.state().pos[0].postatus, 'Submitted');
});
test('foreign institution cannot allocate a PR', async () => {
  const f = fixture(); await assert.rejects(f.pr.create(99, f.body(10)), /not found/); assert.equal(f.state().pos.length, 0);
});
