const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const amounts = require("../utils/purchase2Amounts");

test("percentage discount is deducted before GST", () => {
  const line = amounts.calculatePoLine({ quantity: 2, price: 100, discounttype: "Percentage", discount: 10, gst: 18 }, true);
  assert.equal(line.subtotal, 200);
  assert.equal(line.discountamount, 20);
  assert.equal(line.taxableamount, 180);
  assert.equal(line.gstamount, 32.4);
  assert.equal(line.total, 212.4);
});
test("fixed discounts, decimal money and legacy defaults", () => {
  const line = amounts.calculatePoLine({ quantity: 3, price: 19.99, discount: 5, gst: 5 }, true);
  assert.equal(line.discounttype, "Amount");
  assert.equal(line.subtotal, 59.97);
  assert.equal(line.gstamount, 2.75);
  assert.equal(line.total, 57.72);
  assert.equal(amounts.calculatePoLine({ quantity: 1, price: 0, estimatedprice: 100 }, true).total, 0);
});
test("totals are derived rather than accepted from payload", () => {
  const items = [{ quantity: 2, price: 100, discount: 20, gst: 18, total: 99999 }, { quantity: 1, price: 50, gst: 0 }];
  const summary = amounts.summarizePo(items, true);
  assert.equal(summary.subtotal, 250);
  assert.equal(summary.discountamount, 20);
  assert.equal(summary.gstamount, 32.4);
  assert.equal(summary.actualAmount, 262.4);
  assert.equal(summary.netprice, summary.grandtotal);
});
test("invalid inputs cannot be persisted", () => {
  for (const item of [{ quantity: 0 }, { price: -1 }, { gst: 101 }, { discount: 101 }, { discounttype: "Percentage", discount: 101 }, { price: "invalid" }]) {
    assert.throws(() => amounts.calculatePoLine({ quantity: 1, price: 100, ...item }, true));
  }
});
test("browser and backend calculations remain identical", () => {
  const normalize = text => text.replace(/(?:module.exports =|export) \{ calculatePoLine, summarizePo, roundMoney \};/, "");
  assert.equal(normalize(fs.readFileSync(path.join(__dirname, "../utils/purchase2Amounts.js"), "utf8")), normalize(fs.readFileSync(path.join(__dirname, "../../ep3-main/src/utils/purchase2Amounts.js"), "utf8")));
});

function fixture() {
  const header = { _id: "header", colid: 42, poid: "PO1", calculationrevision: 0 };
  const items = [];
  const scopes = [];
  const itemModel = {
    find: query => { scopes.push(query); return { lean: async () => items.filter(item => item.poid === query.poid && item.colid === query.colid) }; },
    create: async data => { const row = { ...data, _id: String(items.length + 1) }; items.push(row); return row; },
    insertMany: async rows => { const saved = rows.map((row, index) => ({ ...row, _id: String(items.length + index + 1) })); items.push(...saved); return saved; },
    findOne: query => ({ lean: async () => items.find(item => item._id === query._id && item.colid === query.colid) }),
    findOneAndUpdate: async (query, data) => { const row = items.find(item => item._id === query._id && item.colid === query.colid); if (row) Object.assign(row, data); return row; },
    findOneAndDelete: async query => { const i = items.findIndex(item => item._id === query._id && item.colid === query.colid); return i < 0 ? null : items.splice(i, 1)[0]; }
  };
  const headerModel = {
    exists: async query => query.colid === 42 && query.poid === "PO1",
    findOne: () => ({ lean: async () => ({ ...header }) }),
    findOneAndUpdate: async (query, update) => {
      scopes.push(query);
      if (query.colid !== 42 || (query.calculationrevision !== undefined && query.calculationrevision !== header.calculationrevision)) return null;
      if (update.$inc) header.calculationrevision++;
      else Object.assign(header, update.$set || update);
      return { ...header };
    }
  };
  const controller = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/purchase2crudctlrds.js"), "utf8"), {
    module: controller, exports: controller.exports,
    require: name => name.endsWith('purchase2PoRules') ? require('../utils/purchase2PoRules') : name.endsWith("purchase2Amounts") ? amounts : name.endsWith("/storepoitemsds2") ? itemModel : name.endsWith("/storepoorderds2") ? headerModel : {}
  });
  async function invoke(action, model, body, query = {}) {
    let code = 200, data;
    await controller.exports[action]({ params: { model }, body, query }, { status(n) { code = n; return this; }, json(d) { data = d; } });
    return { code, data };
  }
  return { header, items, scopes, invoke, controller: controller.exports };
}
test("API save/edit/delete recalculates PO and overrides tampered totals", async () => {
  const f = fixture();
  let result = await f.invoke("savePurchase2Row", "storepoitemsds2", { colid: 42, poid: "PO1", quantity: 2, price: 100, discount: 20, gst: 18, total: 1 });
  assert.equal(result.code, 200);
  assert.equal(f.items[0].total, 212.4);
  assert.equal(f.header.netprice, 212.4);
  result = await f.invoke("savePurchase2Row", "storepoorderds2", { colid: 42, id: "header", poid: "PO1", actualAmount: 1, discount: 999 });
  assert.equal(result.code, 200);
  assert.equal(f.header.actualAmount, 212.4);
  await f.invoke("savePurchase2Row", "storepoitemsds2", { colid: 42, id: "1", price: 200 });
  assert.equal(f.header.actualAmount, 448.4);
  assert.ok(f.scopes.every(query => query.colid === 42));
  result = await f.invoke("deletePurchase2Row", "storepoitemsds2", { colid: 42, id: "1" });
  assert.equal(result.code, 200);
  assert.equal(f.header.actualAmount, 0);
});
test("cross-institution item cannot be added", async () => {
  const f = fixture();
  const result = await f.invoke("savePurchase2Row", "storepoitemsds2", { colid: 99, poid: "PO1", quantity: 1, price: 100 });
  assert.notEqual(result.code, 200);
  assert.equal(f.items.length, 0);
});
test("bulk uploads and concurrent item saves keep the header synchronized", async () => {
  const f = fixture();
  const result = await f.invoke("bulkPurchase2Rows", "storepoitemsds2", { colid: 42, rows: [{ poid: "PO1", quantity: 2, price: 100, gst: 18, total: 1 }, { poid: "PO1", quantity: 1, price: 50, discounttype: "Percentage", discount: 10, gst: 5 }] });
  assert.equal(result.code, 200);
  assert.equal(f.header.actualAmount, 283.25);
  await Promise.all([1, 2, 3].map(price => f.invoke("savePurchase2Row", "storepoitemsds2", { colid: 42, poid: "PO1", quantity: 1, price })));
  assert.equal(f.header.actualAmount, 289.25);
});
