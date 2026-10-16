const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const path = require("node:path");
const file = path.join(__dirname, "../controllers/librarynewctlrds.js");
const actualRequire = createRequire(file);
const chain = value => ({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });

function fixture() {
  const queries = [];
  let distinctCalls = 0;
  const book = { _id: "book", colid: 42, libraryid: "library", accessionno: "B1", title: "Physics", status: "Available" };
  const models = {
    librarybookds: { find(query) { queries.push(query); return chain([book]); }, countDocuments: async () => 1, distinct: async () => { distinctCalls++; return []; }, findOneAndUpdate: async (_, payload) => payload },
    user: { find(query) { queries.push(query); return chain([]); }, distinct: async () => { distinctCalls++; return []; } },
    libraryissueds: { find(query) { queries.push(query); return chain([]); }, countDocuments: async () => 0, distinct: async () => { distinctCalls++; return []; } },
    librarymasterds: { find: () => chain([{ _id: "library", colid: 42, libraryname: "Main" }]), findOne: () => chain({ _id: "library", libraryname: "Main" }) },
    libraryaccessds: { find: () => chain([]) }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) {
    if (name.startsWith("../Models/")) return models[name.split("/").pop()] || {};
    if (name === "aws-sdk") return {};
    return actualRequire(name);
  }, console, process, Buffer });
  async function invoke(action, query, body = {}) {
    let status = 200, result;
    await module.exports[action]({ query, body }, { status(value) { status = value; return this; }, json(value) { result = value; } });
    assert.equal(status, 200, result?.message);
    return result;
  }
  return { queries, invoke, distinctCalls: () => distinctCalls };
}
test("All role book filters do not require a separate library access assignment", async () => {
  const f = fixture();
  const result = await f.invoke("books", { colid: 42, user: "admin@example.com", role: "All", title: "Physics" });
  assert.equal(result.data.length, 1);
  assert.equal(f.queries[0].colid, 42);
  assert.equal(f.queries[0].libraryid, undefined);
  assert.ok(f.queries[0].title.test("Physics"));
  const libraries = await f.invoke("accessibleLibraryList", { colid: 42, user: "admin@example.com", role: "All" });
  assert.equal(libraries.data.length, 1);
});
test("ordinary user book search retains library access restrictions", async () => {
  const f = fixture();
  await f.invoke("books", { colid: 42, user: "faculty@example.com", role: "Faculty" });
  assert.equal(f.queries[0].libraryid.$in.length, 0);
});
test("blank book status uses the Available default for uploads", async () => {
  const f = fixture();
  const result = await f.invoke("saveBook", {}, { colid: 42, libraryid: "Main", title: "Physics", accessionno: "B1", status: "" });
  assert.equal(result.data.status, "Available");
});
test("on-the-fly searches skip distinct scans and retain institution and student scope", async () => {
  const f = fixture();
  await f.invoke("books", { colid: 42, role: "All", search: "Physics", compact: "yes", limit: 30 });
  assert.ok(f.queries[0].$or.some(entry => entry.title?.test("Physics")));
  await f.invoke("students", { colid: 42, search: "Ann", programcode: "P1", compact: "yes", limit: 30 });
  assert.equal(f.queries[1].colid, 42);
  assert.ok(f.queries[1].role.test("Student"));
  assert.equal(f.queries[1].programcode, "P1");
  await f.invoke("issues", { colid: 42, role: "All", regno: "R1", exactregno: "yes", compact: "yes", limit: 25 });
  assert.equal(f.queries[2].regno, "R1");
  assert.equal(f.queries[2].colid, 42);
  assert.equal(f.distinctCalls(), 0);
});
