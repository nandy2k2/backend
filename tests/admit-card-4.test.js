const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const file = path.join(__dirname, "../controllers/conductexamhallticketctlrds.js");
test("admit card 4 loads scoped master names, photo, signature and mapped paper types", async () => {
  const module = { exports: {} }, queries = [];
  const chain = value => ({ sort() { return this; }, lean: async () => value });
  const first = { colid: 42, academicyear: "2026-27", examcode: "E1", exam: "Old exam", regno: "R1", programcode: "P1", program: "Old program", semester: "5", regulation: "R26", coursecode: "C1" };
  const data = {
    "../Models/conductexamrollds": { find: query => { queries.push(query); return chain([first]); } },
    "../Models/insdetails": { findOne: query => { queries.push(query); return chain({ institutionname: "Institution" }); } },
    "../Models/user": { findOne: query => { queries.push(query); return chain({ name: "Student", regno: "R1", email: "student@example.com", photo: "photo.png" }); } },
    "../Models/usersignatureds": { findOne: query => { queries.push(query); return chain({ signaturelink: "signature.png" }); } },
    "../Models/rolewisesignatureds": { findOne: query => { queries.push(query); assert.equal(query.role, 'coe'); assert.equal(query.status, 'Active'); return chain({ signaturelink: 'coe.png' }); } },
    "../Models/mprograms": { findOne: query => { queries.push(query); return chain({ program: "Master program" }); } },
    "../Models/conductexamds": { findOne: query => { queries.push(query); return chain({ examname: "Master exam", type: "Regular" }); } },
    "../Models/regulationcoursemapds": { find: query => { queries.push(query); return chain([{ ...first, coursetype: "Practical", coursemastercode: "MASTER1" }]); } }
  };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require: name => data[name] || {} });
  let status = 200, result;
  await module.exports.getHallTicket4({ query: { colid: 42, academicyear: "2026-27", examcode: "E1", regno: "R1" } }, { status(value) { status = value; return this; }, json(value) { result = value; } });
  assert.equal(status, 200); assert.equal(result.data.exam.exam, "Master exam");
  assert.equal(result.data.programMaster.program, "Master program"); assert.equal(result.data.rows[0].coursetype, "Practical");
  assert.equal(result.data.rows[0].coursemastercode, "MASTER1");
  assert.equal(result.data.student.photo, "photo.png"); assert.equal(result.data.studentSignature.signaturelink, "signature.png");
  assert.equal(result.data.controllerSignature, undefined);
  await module.exports.getHallTicket4({ query: { colid: 42, academicyear: '2026-27', examcode: 'E1', regno: 'R1', variant: '4a' } }, { status(value) { status = value; return this; }, json(value) { result = value; } });
  assert.equal(result.data.controllerSignature.signaturelink, 'coe.png');
  for (const query of queries) assert.equal(query.colid, 42);
});
