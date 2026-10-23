const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const { createRequire } = require("node:module");
const file = path.join(__dirname, "../controllers/studentbulkfieldsctlrds.js"), realRequire = createRequire(file);
const id = "507f1f77bcf86cd799439011";
function fixture({ student = { regno: "OLD", rollno: "1", photo: "https://old.test/photo.png" }, duplicate = false } = {}) {
  const writes = [], queries = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) {
    if (name === "../Models/user") return { findOne: query => { queries.push(query); return chain(student); }, exists: async query => { queries.push(query); return duplicate; }, updateOne: async (query, update) => { writes.push({ query, update }); return { matchedCount: 1 }; }, find: query => { queries.push(query); return chain([]); }, countDocuments: async () => 0 };
    return realRequire(name);
  } });
  return { writes, queries, run: async (route, body) => {
    let status = 200, data;
    await module.exports.stack.find(layer => layer.route?.path === route).route.stack[0].handle({ body: { colid: 42, ...body }, query: {} }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}
test("each page changes only its allowed User field using ID, Student role and colid", async () => {
  for (const [field, oldvalue, value] of [["regno", "OLD", "NEW"], ["rollno", "1", "2"], ["photo", "https://old.test/photo.png", "https://new.test/photo.png"]]) {
    const f = fixture(), result = await f.run("/save", { field, rows: [{ id, oldvalue, value }] });
    assert.equal(result.data.saved, 1);
    assert.equal(f.writes[0].query.colid, 42); assert.equal(f.writes[0].query._id, id); assert.ok(f.writes[0].query.role.test("Student"));
    assert.deepEqual(Object.keys(f.writes[0].update.$set), [field]); assert.equal(f.writes[0].update.$set[field], value);
  }
});
test("unchanged entries are not written and stale values cannot be overwritten", async () => {
  const f = fixture();
  assert.equal((await f.run("/save", { field: "regno", rows: [{ id, oldvalue: "OLD", value: "OLD" }] })).data.results[0].status, "unchanged");
  assert.equal((await f.run("/save", { field: "regno", rows: [{ id, oldvalue: "STALE", value: "NEW" }] })).data.results[0].status, "error");
  assert.equal(f.writes.length, 0);
});
test("duplicate regnos, foreign students and unsafe photo links are rejected", async () => {
  const duplicate = fixture({ duplicate: true });
  assert.equal((await duplicate.run("/save", { field: "regno", rows: [{ id, oldvalue: "OLD", value: "TAKEN" }] })).data.saved, 0);
  const missing = fixture({ student: null });
  assert.equal((await missing.run("/save", { field: "regno", rows: [{ id, oldvalue: "OLD", value: "NEW" }] })).data.saved, 0);
  const photo = fixture();
  assert.equal((await photo.run("/save", { field: "photo", rows: [{ id, oldvalue: "https://old.test/photo.png", value: "javascript:alert(1)" }] })).data.saved, 0);
});
test("students only load after at least one valid dynamic filter is supplied", async () => {
  const f = fixture(); assert.equal((await f.run("/students", { filters: [] })).status, 400);
  assert.equal((await f.run("/students", { filters: [{ field: "academicyear", value: ["2026-27"] }] })).status, 200);
  assert.equal(f.queries[0].colid, 42); assert.equal(f.queries[0].$and[0].academicyear.$in[0], "2026-27");
});
test("blank old values handle missing User fields without changing unrelated fields", async () => {
  const f = fixture({ student: {} });
  assert.equal((await f.run("/save", { field: "regno", rows: [{ id, oldvalue: "", value: "NEW" }] })).data.saved, 1);
  assert.equal(f.writes[0].query.$or.length, 3);
});
