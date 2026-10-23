const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function setup() {
  const handlers = {}, queries = [];
  const chain = value => ({ select() { return this; }, lean: async () => value });
  const models = Object.fromEntries(['conductexamds', 'conductexamcourseds', 'conductexamrollds', 'insdetails'].map(name => [`../Models/${name}`, {
    find(query) { queries.push(query); return chain([{ _id: 'id', examcode: 'E1' }]); },
    findOne(query) { queries.push(query); return chain({ examname: 'Exam', institutionname: 'Institution' }); }
  }]));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/supervisorsheet2ctlrds.js'), 'utf8'), { module, require: name => name === 'express' ? { Router: () => ({ get: (route, handler) => { handlers[route] = handler; } }) } : models[name] });
  const call = async (route, query) => { let body, status = 200; await handlers[route]({ query }, { status(value) { status = value; return this; }, json(value) { body = value; } }); return { body, status }; };
  return { call, queries };
}
test('masters and sheet queries always include institution; rolls match selected context', async () => {
  const { call, queries } = setup();
  await call('/options', { colid: 42, academicyear: '2026', examcode: 'E1' });
  const result = await call('/sheet', { colid: 42, academicyear: '2026', examcode: 'E1', program: 'Program', programcode: 'P1', course: 'Course', coursecode: 'C1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.rows.length, 1);
  assert.ok(queries.every(query => query.colid === 42));
  assert.equal(queries.at(-1).coursecode, 'C1');
  assert.equal(queries.at(-1).programcode, 'P1');
});
test('missing institution or incomplete context is rejected without reading rolls', async () => {
  const { call, queries } = setup();
  assert.equal((await call('/options', {})).status, 400);
  assert.equal((await call('/sheet', { colid: 42, academicyear: '2026' })).status, 400);
  assert.equal(queries.length, 0);
});
