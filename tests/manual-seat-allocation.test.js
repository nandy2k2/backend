const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const { createRequire } = require("node:module");
const file = path.join(__dirname, "../controllers/manualseatallocationctlrds.js"), realRequire = createRequire(file);
const ids = ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"];
const body = { colid: 42, academicyear: "2026-27", regulation: "R26", examcode: "E1", program: "BSc", programcode: "P1", course: "Physics", coursecode: "C1", building: "Main", room: "101", noofseats: 10, skip: 1, ids };
function fixture({ occupied = [], missing = false } = {}) {
  const writes = [], queries = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) {
    if (name === "../Models/conductexamrollds") return {
      find(query) { queries.push(query); return chain(query._id.$in ? ids.slice(0, missing ? 2 : 3).map((id, index) => ({ _id: id, regno: `R${index}`, examdate: "2026-11-01", examslot: "AM" })) : occupied); },
      bulkWrite: async operations => { writes.push(...operations); return { modifiedCount: operations.length }; }
    };
    if (name === "../Models/conductexamcourseds") return { exists: async query => { queries.push(query); return true; } };
    if (name === "../Models/conductexamroomds") return { findOne: () => chain(null) };
    return realRequire(name);
  } });
  return { writes, queries, run: async patch => {
    let status = 200, data;
    await module.exports.stack[0].route.stack[0].handle({ body: { ...body, ...patch } }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}
test("skip rules allocate deterministic seats and update only selected scoped examrolls", async () => {
  for (const skip of [0, 1, 2, 3]) {
    const f = fixture(), result = await f.run({ skip });
    assert.equal(result.status, 200);
    assert.deepEqual(f.writes.map(row => row.updateOne.update.$set.seatno), [1, 2 + skip, 3 + skip * 2].map(n => `Seat ${n}`));
    for (const row of f.writes) { assert.equal(row.updateOne.filter.colid, 42); assert.equal(row.updateOne.filter.examcode, "E1"); assert.equal(row.updateOne.filter.coursecode, "C1"); assert.equal(row.updateOne.filter.regulation, undefined); }
    assert.equal(f.queries.find(query => query._id?.$in)?.regulation, undefined);
  }
});
test("insufficient capacity rejects before updating any students", async () => {
  const f = fixture(), result = await f.run({ noofseats: 3, skip: 1 });
  assert.equal(result.status, 400); assert.equal(f.writes.length, 0);
});
test("existing occupied seats are respected with spacing", async () => {
  const f = fixture({ occupied: [{ seatno: "Seat 1" }] });
  assert.equal((await f.run()).status, 200);
  assert.deepEqual(f.writes.map(row => row.updateOne.update.$set.seatno), ["Seat 3", "Seat 5", "Seat 7"]);
});
test("seats occupied by other programs or courses remain unavailable in the same exam session and room", async () => {
  const f = fixture({ occupied: [{ seatno: "Seat 1", programcode: "OTHER", coursecode: "OTHER" }, { seatno: "2", programcode: "P1", coursecode: "OTHER" }] });
  assert.equal((await f.run({ skip: 0 })).status, 200);
  assert.deepEqual(f.writes.map(row => row.updateOne.update.$set.seatno), ["Seat 3", "Seat 4", "Seat 5"]);
  const occupiedQuery = f.queries.find(query => query._id?.$nin);
  assert.equal(occupiedQuery.colid, 42);
  assert.equal(occupiedQuery.examcode, "E1");
  assert.equal(occupiedQuery.examdate, "2026-11-01");
  assert.equal(occupiedQuery.examslot, "AM");
  assert.equal(occupiedQuery.building, "Main");
  assert.equal(occupiedQuery.examroom, "101");
  for (const field of ["program", "programcode", "course", "coursecode", "regulation", "campus"]) assert.equal(occupiedQuery[field], undefined);
});
test("occupied room seats cannot be reused when remaining capacity is insufficient", async () => {
  const f = fixture({ occupied: [{ seatno: "Seat 1" }, { seatno: "Seat 2" }] });
  assert.equal((await f.run({ skip: 0, noofseats: 4 })).status, 400);
  assert.equal(f.writes.length, 0);
});
test("foreign or stale selected IDs and invalid rules cannot be allocated", async () => {
  const stale = fixture({ missing: true }); assert.equal((await stale.run()).status, 400); assert.equal(stale.writes.length, 0);
  for (const patch of [{ colid: 0 }, { skip: 4 }, { noofseats: 1.5 }, { ids: ["bad"] }]) {
    const f = fixture(); assert.equal((await f.run(patch)).status, 400); assert.equal(f.writes.length, 0);
  }
});
test("optional block number is trimmed and assigned only when provided", async () => {
  const f = fixture();
  assert.equal((await f.run({ blockno: " B-12 " })).status, 200);
  for (const write of f.writes) assert.equal(write.updateOne.update.$set.blockno, "B-12");
  for (const blockno of [undefined, "", "   "]) {
    const blank = fixture(); assert.equal((await blank.run({ blockno })).status, 200);
    for (const write of blank.writes) assert.equal(Object.hasOwn(write.updateOne.update.$set, "blockno"), false);
  }
  const invalid = fixture(); assert.equal((await invalid.run({ blockno: "x".repeat(101) })).status, 400); assert.equal(invalid.writes.length, 0);
});
