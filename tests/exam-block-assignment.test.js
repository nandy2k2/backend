const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const { createRequire } = require("node:module");
const file = path.join(__dirname, "../controllers/examblockassignmentctlrds.js"), realRequire = createRequire(file);
function fixture() {
  const writes = [], queries = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) {
    if (name === "../Models/conductexamrollds") return { find: query => { queries.push(query); return chain([]); }, updateMany: async (query, update) => { writes.push({ query, update }); return { matchedCount: 1, modifiedCount: 1 }; } };
    if (name === "../Models/conductexamds") return {};
    return realRequire(name);
  } });
  return { writes, queries, run: async (route, body) => {
    let status = 200, data;
    const handler = module.exports.stack.find(layer => layer.route?.path === route).route.stack[0].handle;
    await handler({ method: "POST", body }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}
const body = { colid: 42, academicyear: "2026-27", examcode: "E1", programs: [{ program: "BSc", programcode: "P1" }, { program: "BA", programcode: "P2" }], blockno: " B-12 ", ids: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"] };
test("block assignment only changes blockno on selected scoped examrolls and program pairs", async () => {
  const f = fixture(), result = await f.run("/assign", body);
  assert.equal(result.status, 200); assert.equal(result.data.skipped, 1);
  const { query, update } = f.writes[0];
  assert.equal(query.colid, 42); assert.equal(query.academicyear, "2026-27"); assert.equal(query.examcode, "E1");
  assert.equal(query.$or.length, 2); assert.equal(query.$or[1].programcode, "P2");
  assert.equal(query._id.$in.length, 2); assert.deepEqual(Object.keys(update.$set), ["blockno"]); assert.equal(update.$set.blockno, "B-12");
});
test("student load uses academic year, exam and selected program pairs without preloading", async () => {
  const f = fixture(); assert.equal((await f.run("/students", body)).status, 200);
  assert.equal(f.queries[0].examcode, "E1"); assert.equal(f.queries[0].$or[0].program, "BSc");
});
test("invalid scope, selection or block number cannot update examroll", async () => {
  for (const patch of [{ colid: 0 }, { academicyear: "" }, { examcode: "" }, { programs: [] }, { ids: [] }, { ids: ["bad"] }, { blockno: "" }]) {
    const f = fixture(); assert.equal((await f.run("/assign", { ...body, ...patch })).status, 400); assert.equal(f.writes.length, 0);
  }
});
