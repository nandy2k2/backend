const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Config = require('../Models/pingwhatsappconfigds');
const controller = require('../controllers/pingwhatsappconfigctlrds');
const original = [Config.create, Config.findOneAndUpdate, Config.deleteMany];
afterEach(() => { [Config.create, Config.findOneAndUpdate, Config.deleteMany] = original; });
const response = () => ({ code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } });
test('saves identifiers as strings with a tenant scope and validates required fields', async () => {
  Config.create = async value => { assert.equal(value.phoneid, '001234'); assert.equal(value.apiid, 'API1'); assert.equal(value.colid, 42); return value; };
  const res = response(); await controller.save({ query: {}, body: { colid: 42, phoneid: '001234', apiid: ' API1 ', active: 'No' } }, res);
  assert.equal(res.code, 200); assert.equal(res.data.data.active, 'No');
  const invalid = response(); await controller.save({ query: {}, body: { colid: 42, phoneid: '123', apiid: '' } }, invalid); assert.equal(invalid.code, 400);
});
test('updates and bulk deletes are tenant scoped; bulk upload cannot override the institution', async () => {
  Config.findOneAndUpdate = async (query, update) => { assert.equal(query.colid, 42); assert.equal(update.$set.colid, 42); return update.$set; };
  const res = response(); await controller.bulk({ query: {}, body: { colid: 42, rows: [{ colid: 99, phoneid: '001', apiid: 'A1', active: 'Yes' }] } }, res); assert.equal(res.data.saved, 1);
  Config.deleteMany = async query => { assert.equal(query.colid, 42); assert.deepEqual(query._id.$in, ['row1','row2']); return { deletedCount: 2 }; };
  const removed = response(); await controller.remove({ query: {}, body: { colid: 42, ids: ['row1','row2'] } }, removed); assert.equal(removed.data.deleted, 2);
});
