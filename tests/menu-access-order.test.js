const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
test("menu order is optional, saved as a number and can be cleared", async () => {
  const writes = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/menuaccessctlrds.js"), "utf8"), { module, exports: module.exports, require(name) { return name.includes("menuaccessds") ? { create: async payload => { writes.push(payload); return payload; }, findByIdAndUpdate: async (id, payload) => { writes.push(payload); return payload; } } : {}; } });
  const body = { colid: 42, menugroup: "Fees", title: "Report", path: "/report", role: "Faculty", access: "Allow" };
  const res = { status() { return this; }, json() {} };
  await module.exports.createMenuAccessRule({ body }, res);
  assert.equal(writes[0].order, undefined);
  await module.exports.createMenuAccessRule({ body: { ...body, order: "0" } }, res);
  assert.equal(writes[1].order, 0);
  await module.exports.updateMenuAccessRule({ body: { ...body, id: "id", order: "" } }, res);
  assert.equal(writes[2].$unset.order, 1);
});
