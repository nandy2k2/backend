const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Address, FormMapping } = require('../Models/crm2configurationds');
const Program = require('../Models/mprograms');
const Form = require('../Models/admissiondynamicform');
const { payload, router } = require('../controllers/crm2configurationctlrds');
const originals = [];
const stub = (obj, key, fn) => { originals.push([obj,key,obj[key]]); obj[key] = fn; };
afterEach(() => { while (originals.length) { const [obj,key,fn] = originals.pop(); obj[key] = fn; } });
test('address requires all three levels and generates normalized keys', async () => {
  const data = await payload('address', { country: ' India ', state: 'Gujarat', city: 'Ahmedabad', colid: 999 }, 42, 'user');
  assert.equal(data.colid, 42); assert.equal(data.countrykey, 'india'); assert.equal(data.citykey, 'ahmedabad');
  await assert.rejects(() => payload('address', { country: 'India', city: 'Ahmedabad' }, 42, 'user'));
  assert.equal(new Address(data).validateSync(), undefined);
});
test('form mapping resolves canonical program and form from scoped masters', async () => {
  stub(Program, 'findOne', query => { assert.deepEqual(query, { colid: 42, year: '2026-27', programcode: '012' }); return { lean: async () => ({ program: 'Master program', programcode: '012' }) }; });
  stub(Form, 'findOne', query => { assert.deepEqual(query, { colid: 42, formid: 'FORM1' }); return { lean: async () => ({ formid: 'FORM1', title: 'Admission Form' }) }; });
  const data = await payload('form-mapping', { academicyear: '2026-27', programcode: '012', formid: 'FORM1', program: 'Spoof' }, 42, 'user');
  assert.equal(data.program, 'Master program'); assert.equal(data.formtitle, 'Admission Form');
  assert.equal(new FormMapping(data).validateSync(), undefined);
});
test('foreign/missing master is rejected', async () => {
  stub(Program, 'findOne', () => ({ lean: async () => null }));
  stub(Form, 'findOne', () => ({ lean: async () => ({ formid: 'FORM1' }) }));
  await assert.rejects(() => payload('form-mapping', { academicyear: '2026-27', programcode: 'P1', formid: 'FORM1' }, 42, 'user'), /valid/);
});
test('city dropdown requires country and state and scopes their matches', async () => {
  let called = 0;
  stub(Address, 'aggregate', async pipeline => { called++; assert.equal(pipeline[0].$match.colid, 42); assert.equal(pipeline[0].$match.country.source, '^India$'); assert.equal(pipeline[0].$match.state.source, '^Gujarat$'); return [{ _id: 'Ahmedabad' }]; });
  const handler = router.stack.find(layer => layer.route.path === '/address-options').route.stack[0].handle;
  const res = { json(data) { this.data = data; }, status() { return this; } };
  await handler({ query: { colid: 42, field: 'city', country: 'India' } }, res);
  assert.equal(called, 0); assert.deepEqual(res.data.data, []);
  await handler({ query: { colid: 42, field: 'city', country: 'India', state: 'Gujarat' } }, res);
  assert.equal(called, 1); assert.deepEqual(res.data.data, ['Ahmedabad']);
});
