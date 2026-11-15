const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('indents and store PRs share a daily institution sequence based on IST', async () => {
  let clock = '2026-11-07T18:29:59Z';
  class FixedDate extends Date { constructor() { super(clock); } }
  class Schema { index() {} }
  const counters = new Map();
  const models = {
    purchase2prdailycounter: {
      async findOneAndUpdate({ _id }) {
        const serial = (counters.get(_id) || 0) + 1;
        counters.set(_id, serial);
        return { serial };
      }
    }
  };
  const lookup = (row) => ({ session: () => ({ lean: async () => row }) });
  const dependencies = {
    mongoose: { Schema, models, model: (name) => models[name], isValidObjectId: Boolean },
    '../Models/storemasterds2': { findOne: ({ _id }) => lookup({ institutionid: _id === 'store-c' ? 'pu' : 'pcms' }) },
    '../Models/academicmasterinstitutionds': { findOne: ({ _id }) => lookup({ shortname: _id }) }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/purchase2PrCreation'), 'utf8'), {
    module, require: (name) => dependencies[name], Date: FixedDate
  });
  const Model = { create: async (rows) => rows };
  const save = (key, storeid) => module.exports.save(Model, key, { colid: 10, storeid }, null, {});
  const indent = await save('storerequisitionds2', 'store-a');
  assert.equal(indent.reqid, 'PR_PCMS_2026_11_07_001');
  assert.equal(indent.requesttime, '23:59:59');
  assert.equal((await save('storeprrequestds2', 'store-b')).prnumber, 'PR_PCMS_2026_11_07_002');
  assert.equal((await save('storeprrequestds2', 'store-c')).prnumber, 'PR_PU_2026_11_07_001');
  const po = unitcode => module.exports.poNumber(10, {unitcode}, {});
  assert.deepEqual(await Promise.all([po('PCMS'),po('PCMS'),po('PU')]), ['PO_PCMS_2026_11_07_001','PO_PCMS_2026_11_07_002','PO_PU_2026_11_07_001']);
  clock = '2026-11-07T18:30:00Z';
  assert.equal((await save('storeprrequestds2', 'store-b')).prnumber, 'PR_PCMS_2026_11_08_001');
  assert.equal(await po('PCMS'), 'PO_PCMS_2026_11_08_001');
  assert.throws(() => module.exports.prefix('', new Date()), /short name/);
});
