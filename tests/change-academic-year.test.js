const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const { createRequire } = require("node:module");
const file = path.join(__dirname, "../controllers/repairmaintenancectlrds.js");
const actualRequire = createRequire(file);
function fixture() {
  const updates = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) {
    if (name === "../Models/user") return { updateMany: async (query, update) => { updates.push({ query, update }); return { matchedCount: 1, modifiedCount: 1 }; } };
    return actualRequire(name);
  } });
  return { updates, run: async body => {
    let status = 200, data;
    await module.exports.changeStudentAcademicYear({ body }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}
const body = { colid: 42, oldacademicyear: "2025-26", newacademicyear: "2026-27", ids: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"] };
test("changes only selected Student records for the institution and old academic year", async () => {
  const f = fixture(), result = await f.run(body);
  assert.equal(result.status, 200);
  assert.equal(result.data.skipped, 1);
  const { query, update } = f.updates[0];
  assert.equal(query.colid, 42);
  assert.equal(query.academicyear, "2025-26");
  assert.ok(query.role.test("Student"));
  assert.ok(!query.role.test("Faculty"));
  assert.equal(query._id.$in.length, 2);
  assert.deepEqual(Object.keys(update.$set), ["academicyear"]);
  assert.equal(update.$set.academicyear, "2026-27");
});
test("rejects missing scope, invalid selections and unchanged academic years", async () => {
  for (const patch of [{ colid: null }, { ids: [] }, { ids: ["bad-id"] }, { newacademicyear: body.oldacademicyear }, { newacademicyear: "" }]) {
    const f = fixture(), result = await f.run({ ...body, ...patch });
    assert.equal(result.status, 400);
    assert.equal(f.updates.length, 0);
  }
});
