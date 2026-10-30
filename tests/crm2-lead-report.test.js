const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { queryFor, fields, projection } = require('../utils/crm2LeadReport');
const { Lead, masterModels } = require('../Models/crm2ds');
const Program = require('../Models/mprograms');
const Institution = require('../Models/insdetails');
const router = require('../controllers/crm2leadreportctlrds');
const originals = [Lead.aggregate, Program.find, Institution.findOne, masterModels.source.distinct];
afterEach(() => { [Lead.aggregate, Program.find, Institution.findOne, masterModels.source.distinct] = originals; });
const chain = data => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => data });
async function invoke(route, query = {}) {
  const layer = router.stack.find(layer => layer.route?.path === route);
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  await layer.route.stack[0].handle({ query: { colid: 42, ...query } }, res);
  return res;
}
test('metadata includes admitted, stage, profile and nested education/program fields but no secrets', () => {
  for (const field of ['admitted','stage','stagetime','source','education.subjects.grade','programsinterested.programcode','program','programcode']) assert.ok(fields.some(row => row.field === field), field);
  assert.ok(!fields.some(row => /password|token|secret|^colid$|emailkey|phonekey/i.test(row.field)));
  assert.equal(projection.password, 0); assert.equal(projection.emailkey, 0);
});
test('program codes and program-interest criteria match the same array entry without duplicating leads', () => {
  const query = queryFor(42, { programcodes: JSON.stringify(['P1','P2']), filters: JSON.stringify([{ field: 'programsinterested.academicyear', values: ['2026-27'] }, { field: 'admitted', values: ['Yes'] }]) });
  assert.equal(query.colid, 42);
  const match = query.$and.find(clause => clause.programsinterested).programsinterested.$elemMatch.$and;
  assert.deepEqual(match[0].programcode.$in, ['P1','P2']);
  assert.equal(match[1].academicyear.$in[0].source, '^2026-27$');
  assert.equal(query.$and[0].admitted.$in[0].source, '^Yes$');
});
test('academic-year filtering falls back to program-interest year only when the lead year is blank', () => {
  const query = queryFor(42, { programcodes: '["P1"]', filters: JSON.stringify([{ field: 'academicyear', values: ['2026-27'] }]) });
  const alternatives = query.$and[0].$or;
  assert.equal(alternatives[0].$and[0].academicyear.$in[0].source, '^2026-27$');
  assert.deepEqual(alternatives[1].$and[0].academicyear.$in, ['', null]);
  const sameProgram = alternatives[1].$and[1].programsinterested.$elemMatch.$and;
  assert.deepEqual(sameProgram[0].programcode.$in, ['P1']);
  assert.equal(sameProgram[1].academicyear.$in[0].source, '^2026-27$');
  assert.equal(query.colid, 42);
});
test('typed dynamic filters are escaped and unsafe fields cannot change institution scope', () => {
  const query = queryFor(42, { filters: JSON.stringify([{ field: 'name', operator: 'contains', values: ['Ann.*'] }, { field: 'education.marks', operator: 'gte', values: ['100000'] }, { field: 'stagetime', operator: 'lte', values: ['2026-10-30'] }]) });
  assert.equal(query.$and[0].name.$in[0].source, 'Ann\\.\\*');
  assert.equal(query.$and[1]['education.marks'].$gte, 100000);
  assert.equal(query.$and[2].stagetime.$lt.toISOString(), '2026-10-31T00:00:00.000Z');
  for (const field of ['colid','password','$where','__proto__']) assert.throws(() => queryFor(42, { filters: JSON.stringify([{ field, values: ['anything'] }]) }), /Invalid/);
  assert.throws(() => queryFor(42, { dateFrom: '2026-02-30' }), /valid date/);
  assert.throws(() => queryFor(42, { dateFrom: '2026-10-31', dateTo: '2026-10-01' }), /From date/);
});
test('report facets keep summary counts over all filtered leads while paginating safe detail rows', async () => {
  Lead.aggregate = async pipeline => {
    assert.equal(pipeline[0].$match.colid, 42);
    const facet = pipeline[1].$facet;
    assert.ok(facet.total.some(step => step.$count));
    assert.equal(facet.data.find(step => step.$skip).$skip, 25);
    assert.equal(facet.data.find(step => step.$limit).$limit, 25);
    assert.equal(facet.data.find(step => step.$project).$project.password, 0);
    assert.ok(facet.programs.some(step => step.$group?._id?.lead === '$_id'));
    return [{ total: [{ count: 200 }], data: [{ _id: 'lead1', name: 'Ann' }], admitted: [{ _id: 'Yes', count: 20 }], programs: [{ _id: 'P1', program: 'Science', count: 30 }] }];
  };
  Institution.findOne = query => { assert.deepEqual(query, { colid: 42 }); return chain({ institutionname: 'College', logolink: 'https://example.com/logo.png' }); };
  const res = await invoke('/lead-report', { skip: '25', limit: '25' });
  assert.equal(res.code, 200); assert.equal(res.data.total, 200); assert.equal(res.data.data.length, 1);
  assert.equal(res.data.summary.admitted[0].count, 20); assert.equal(res.data.institution.institutionname, 'College');
});
test('export reads every filtered row with a cap instead of exporting only the visible page', async () => {
  Lead.aggregate = async pipeline => { assert.equal(pipeline[1].$facet.data.find(step => '$skip' in step).$skip, 0); assert.equal(pipeline[1].$facet.data.find(step => step.$limit).$limit, 10001); return [{ data: Array(10001).fill({}) }]; };
  const res = await invoke('/lead-report', { export: 'true', skip: '250' });
  assert.equal(res.code, 400); assert.match(res.data.message, /10,000/);
});
test('program options use Program master and field dropdowns use their corresponding CRM master', async () => {
  Program.find = query => { assert.equal(query.colid, 42); return chain([{ program: 'Science', programcode: 'P1' }, { program: 'Science', programcode: 'P1' }]); };
  assert.equal((await invoke('/lead-report-programs')).data.data.length, 1);
  masterModels.source.distinct = async (field, query) => { assert.equal(field, 'name'); assert.equal(query.colid, 42); return ['Website','Referral']; };
  assert.deepEqual((await invoke('/lead-report-options', { field: 'source' })).data.data, ['Referral','Website']);
  assert.equal((await invoke('/lead-report-options', { field: 'password' })).code, 400);
});
