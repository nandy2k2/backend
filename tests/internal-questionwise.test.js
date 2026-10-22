const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const { createRequire } = require("node:module");
const file = path.join(__dirname, "../controllers/internalquestionwisectlrds.js"), realRequire = createRequire(file);
const context = { colid: 42, academicyear: "2026-27", examcode: "E1", regulation: "R26", programcode: "P1", semester: "1", coursecode: "C1", assessmentid: "a1" };
const question = { ...context, _id: "q1", questionno: "1", question: "Explain", questiontype: "Descriptive", fullmarks: 10, coid: "co1", conumber: "CO1", co: "Explain concepts" };
function fixture({ marks = [], allowed = true, previous = null, fullmarks = 10, legacy = false } = {}) {
  const writes = [], delegated = [], queries = [], module = { exports: {} };
  const chain = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
  const models = {
    "../Models/internalquestionwiseds": { Question: { collection: { createIndex: async () => {}, dropIndex: async () => {} }, exists: async () => false, updateMany: async (query, update) => writes.push({ query, update }), find: query => { queries.push(query); return chain([{ ...question, fullmarks, ...(legacy ? { assessmentid: "" } : {}) }]); }, findOne: () => chain(null), findOneAndUpdate: async (query, update) => writes.push({ query, update }) }, Mark: { updateMany: async (query, update) => writes.push({ query, update }), find: query => { queries.push(query); return chain(marks); }, exists: async () => false, bulkWrite: async operations => writes.push(...operations) } },
    "../Models/regulationcoursemapds": { findOne: () => chain({ program: "BSc", course: "Physics" }) },
    "../Models/conductexamds": { findOne: () => chain({ examname: "Exam" }) },
    "../Models/courseoutcomeds": { findOne: () => chain({ _id: "co1", conumber: "CO1", co: "Explain concepts" }) },
    "../Models/user": { find: query => { queries.push(query); return chain([{ name: "Student", regno: "R1", email: "s@example.com" }]); } },
    "../Models/assessmentcomponentds": { findOne: query => { queries.push(query); return chain(query._id === "a1" ? { _id: "a1", marks: 10, componenttype: "Theory", scoretype: "Internal", assessmentcomponent: "Test", weightage: 0.5 } : null); }, find: () => chain([{ _id: "a1", marks: 10, componenttype: "Theory", scoretype: "Internal", assessmentcomponent: "Test", weightage: 0.5 }]) },
    "../Models/exammodel2componentmarksds": { findOne: () => chain(previous) },
    "./conductexamcomponentallocationctlrds": { checkInternalMarksEntryDate: async (req, res) => res.json({ allowed, message: "Dates closed" }), saveInternalMarks: async (req, res) => { delegated.push(req.body); res.json({ saved: req.body.rows.length }); } }
  };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require: name => models[name] || realRequire(name) });
  return { writes, delegated, queries, run: async (method, route, body = {}) => {
    let status = 200, data;
    const layer = module.exports.stack.find(row => row.route?.path === route && row.route.methods[method]);
    await layer.route.stack[0].handle({ body: method === "post" ? { ...context, ...body } : {}, query: method === "get" ? { ...context, ...body } : {} }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}
test("question marks persist CO snapshots and scoped student/course details", async () => {
  const f = fixture(), result = await f.run("post", "/marks/save", { cells: [{ regno: "R1", questionid: "q1", marks: 8 }] });
  assert.equal(result.status, 200);
  assert.equal(f.writes[0].updateOne.update.$set.co, "Explain concepts");
  assert.equal(f.writes[0].updateOne.filter.colid, 42);
  assert.equal(f.writes[0].updateOne.update.$set.examcode, "E1");
  assert.equal(f.writes[0].updateOne.update.$set.assessmentid, "a1");
  assert.equal(f.writes[0].updateOne.update.$set.assessmentcomponent, "Test");
});
test("invalid question marks or students are rejected before writes", async () => {
  for (const cell of [{ regno: "R1", questionid: "q1", marks: 11 }, { regno: "OTHER", questionid: "q1", marks: 1 }]) {
    const f = fixture(); assert.equal((await f.run("post", "/marks/save", { cells: [cell] })).status, 400); assert.equal(f.writes.length, 0);
  }
});
test("full marks are accepted but higher marks never reach storage", async () => {
  const f = fixture();
  assert.equal((await f.run("post", "/marks/save", { cells: [{ regno: "R1", questionid: "q1", marks: 10 }] })).status, 200);
  assert.equal(f.writes[0].updateOne.update.$set.marks, 10);
  const invalid = fixture();
  assert.equal((await invalid.run("post", "/marks/save", { cells: [{ regno: "R1", questionid: "q1", marks: 10.01 }] })).status, 400);
  assert.equal(invalid.writes.length, 0);
});
test("closed entry dates block questionwise saving", async () => {
  const f = fixture({ allowed: false }); assert.equal((await f.run("post", "/marks/save", { cells: [] })).status, 400);
});
test("aggregate delegates raw total to existing weighted internal marks save", async () => {
  const f = fixture({ marks: [{ questionid: "q1", regno: "R1", marks: 8 }] });
  assert.equal((await f.run("post", "/aggregate", { assessmentid: "a1", regnos: ["R1"] })).status, 200);
  assert.equal(f.delegated[0].rows[0].rawmarks, 8);
  assert.equal(f.delegated[0].assessmentid, "a1");
});
test("aggregation refuses incomplete marks, mismatched max or approved marks", async () => {
  for (const settings of [{ marks: [] }, { fullmarks: 20, marks: [{ questionid: "q1", regno: "R1", marks: 8 }] }, { previous: { approvalstatus: "Approved" }, marks: [{ questionid: "q1", regno: "R1", marks: 8 }] }]) {
    const f = fixture(settings); assert.equal((await f.run("post", "/aggregate", { assessmentid: "a1", regnos: ["R1"] })).status, 400); assert.equal(f.delegated.length, 0);
  }
});
test("new questions copy course-specific CO and do not change academic context", async () => {
  const f = fixture();
  const result = await f.run("post", "/questions/save", { ...question, targets: [{ ...context, coid: "co1" }] });
  assert.equal(result.status, 200);
  assert.equal(f.writes[0].update.$set.conumber, "CO1");
  assert.equal(f.writes[0].query.colid, 42);
  assert.equal(f.writes[0].query.assessmentid, "a1");
});
test("assessment component is required and validated against the selected course", async () => {
  for (const assessmentid of ["", "foreign"]) {
    const f = fixture(); assert.equal((await f.run("get", "/grid", { assessmentid })).status, 400);
  }
});
test("questionwise grids enforce entry dates and filter questions and marks by component", async () => {
  const closed = fixture({ allowed: false }); assert.equal((await closed.run("get", "/grid", { mode: "entry" })).status, 400);
  const f = fixture(); assert.equal((await f.run("get", "/grid", { mode: "entry" })).status, 200);
  assert.ok(f.queries.filter(row => row.assessmentid === "a1").length >= 2);
});
test("legacy linking updates both questions and saved marks with the selected component", async () => {
  const f = fixture({ legacy: true });
  assert.equal((await f.run("post", "/questions/link-component", { ids: ["q1"] })).status, 200);
  assert.equal(f.writes.length, 2);
  for (const write of f.writes) { assert.equal(write.query.colid, 42); assert.equal(write.update.$set.assessmentid, "a1"); assert.equal(write.update.$set.assessmentcomponent, "Test"); }
});
