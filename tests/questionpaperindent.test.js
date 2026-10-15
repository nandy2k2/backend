const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const controllerPath = path.join(__dirname, "../controllers/questionpaperindentctlrds.js");
const originalRequire = createRequire(controllerPath);
const panelid = "507f1f77bcf86cd799439011", memberid = "507f1f77bcf86cd799439012";
const panel = { _id: panelid, colid: 42, panelname: "Test panel", program: "Program", programcode: "P1", semester: "1", course: "Course", coursecode: "C1" };
const chain = (value) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
function fixture(overrides = {}) {
  const calls = [];
  const models = {
    Panel: { findOne: () => chain(panel) },
    Member: {}, Workflow: {}, Assignment: {}, CommunicationLog: {}, ...overrides.models
  };
  const user = overrides.user || {};
  const module = { exports: {} };
  const requireMock = (name) => {
    if (name === "../Models/questionpaperindentds") return models;
    if (name === "../Models/user") return user;
    if (name === "../utils/approvalTaskHelper") return { createApprovalTasks: async (args) => calls.push(["createTask", args]), completeApprovalTasks: async (args) => calls.push(["completeTask", args]) };
    if (name === "./bhashwhatsappctlrds") return {};
    if (name.startsWith("../Models/")) return {};
    return originalRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(controllerPath, "utf8"), { require: requireMock, module, exports: module.exports, process, console, URL, Buffer, setTimeout });
  const router = module.exports;
  const invoke = async (method, route, body = {}, query = {}, params = {}) => {
    const layer = router.stack.find((l) => l.route?.path === route && l.route.methods[method]);
    assert.ok(layer, route);
    let code = 200, data;
    await layer.route.stack.at(-1).handle({ body, query, params, get: () => "https://example.com" }, { status(n) { code = n; return this; }, json(value) { data = value; return this; } });
    return { code, data };
  };
  return { invoke, calls };
}

test("institution scope is mandatory", async () => {
  const { invoke } = fixture();
  const result = await invoke("get", "/options");
  assert.equal(result.code, 400);
});

test("external duplicate email cannot create a member or User", async () => {
  let creates = 0;
  const { invoke } = fixture({ user: { exists: async () => true }, models: { Member: { create: async () => { creates++; } } } });
  const result = await invoke("post", "/:entity/save", { colid: 42, panelid, kind: "External", membername: "External", memberemail: "member@example.com", profile: { phone: "9999999999", department: "Department" } }, {}, { entity: "members" });
  assert.equal(result.code, 409);
  assert.equal(creates, 0);
});

test("submission gates external members on Accepted and Draft/Rejected", async () => {
  let queried;
  const { invoke, calls } = fixture({ models: { Workflow: { findOne: () => chain({ levels: [{ order: 1, approveremail: "one@example.com" }] }) }, Member: { findOneAndUpdate: async (query) => { queried = query; return null; } } } });
  const result = await invoke("post", "/approval/start", { colid: 42, panelid, ids: [memberid] });
  assert.equal(queried.colid, 42);
  assert.equal(queried.invitationstatus, "Accepted");
  assert.equal(result.data.updated, 0);
  assert.equal(calls.length, 0);
});

test("approval advances one member to next user and completes previous task", async () => {
  let saved = 0, queried;
  const member = { _id: memberid, colid: 42, membername: "Member", kind: "External", currentlevel: 1, currentapprover: "one@example.com", history: [], levels: [{ order: 1, approveremail: "one@example.com" }, { order: 2, approveremail: "two@example.com" }], save: async () => { saved++; }, toObject() { return { ...this }; } };
  const { invoke, calls } = fixture({ models: { Member: { findOneAndUpdate: async (query) => { queried = query; return member; } } } });
  const result = await invoke("post", "/approval/decide", { colid: 42, panelid, user: "one@example.com", ids: [memberid], decision: "Approved" });
  assert.equal(result.code, 200);
  assert.equal(queried.currentapprover, "one@example.com");
  assert.equal(member.currentapprover, "two@example.com");
  assert.equal(member.approvalstatus, "Pending");
  assert.equal(saved, 1);
  assert.equal(calls[0][0], "completeTask");
  assert.equal(calls[0][1].level, 1);
  assert.equal(calls[1][1].approveremail, "two@example.com");
});

test("rejection stops the chain and completes current task", async () => {
  const member = { _id: memberid, colid: 42, membername: "Member", kind: "Internal", currentlevel: 1, currentapprover: "one@example.com", history: [], levels: [{ order: 1 }, { order: 2, approveremail: "two@example.com" }], save: async () => {}, toObject() { return { ...this }; } };
  const { invoke, calls } = fixture({ models: { Member: { findOneAndUpdate: async () => member } } });
  await invoke("post", "/approval/decide", { colid: 42, panelid, user: "one@example.com", ids: [memberid], decision: "Rejected", comments: "Not suitable" });
  assert.equal(member.approvalstatus, "Rejected");
  assert.equal(member.currentapprover, "");
  assert.equal(calls.length, 1);
});

test("external User is created only on final approval with panel program details", async () => {
  let created;
  const member = { _id: memberid, colid: 42, membername: "External Member", memberemail: "external@example.com", kind: "External", profile: { phone: "9999999999", department: "Department" }, currentlevel: 2, currentapprover: "two@example.com", history: [], levels: [{ order: 1 }, { order: 2 }], save: async () => {}, toObject() { return { ...this }; } };
  const { invoke, calls } = fixture({ user: { findOne: async () => null, create: async (value) => { created = value; return { _id: "507f1f77bcf86cd799439013" }; } }, models: { Member: { findOneAndUpdate: async () => member } } });
  const result = await invoke("post", "/approval/decide", { colid: 42, panelid, user: "two@example.com", ids: [memberid], decision: "Approved" });
  assert.equal(result.code, 200);
  assert.equal(member.approvalstatus, "Approved");
  assert.equal(created.colid, 42);
  assert.equal(created.programcode, "P1");
  assert.equal(created.role, "papersetter");
  assert.equal(created.email, "external@example.com");
  assert.equal(calls.length, 1);
});

test("public invitation lookup does not mutate and responses are single-use", async () => {
  const token = "a".repeat(64);
  let lookup, responseQuery;
  const { invoke } = fixture({ models: { Member: { findOne: (q) => { lookup = q; return chain({ membername: "Guest", invitationstatus: "Not confirmed", panelid, colid: 42 }); }, findOneAndUpdate: async (q) => { responseQuery = q; return { invitationstatus: "Accepted" }; } } } });
  const info = await invoke("get", "/invitation", {}, { token });
  assert.equal(info.code, 200);
  assert.equal(responseQuery, undefined);
  assert.equal(lookup.invitationhash, crypto.createHash("sha256").update(token).digest("hex"));
  const result = await invoke("post", "/invitation", { token, decision: "Accepted" });
  assert.equal(result.code, 200);
  assert.equal(responseQuery.invitationstatus, "Not confirmed");
  assert.equal(responseQuery.approvalstatus, "Draft");
});

test("assignment requires finally approved accepted member in scoped panel", async () => {
  let query;
  const { invoke } = fixture({ models: { Member: { findOne: (q) => { query = q; return chain(null); } } } });
  const result = await invoke("post", "/:entity/save", { colid: 42, panelid, memberid }, {}, { entity: "assignments" });
  assert.equal(result.code, 400);
  assert.equal(query.colid, 42);
  assert.equal(query.approvalstatus, "Approved");
  assert.equal(query.invitationstatus, "Accepted");
});
