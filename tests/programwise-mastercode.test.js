const test = require("node:test");
const assert = require("node:assert/strict");
const Roll = require("../Models/conductexamrollds");
const Submission = require("../Models/conductexamformsubmissionds");

test("examroll preserves master code without replacing course or exam code", () => {
  const row = new Roll({ colid: 42, academicyear: "2026-27", regulation: "R2026", exam: "Final", examcode: "EX1", programcode: "P1", type: "Major", semester: "1", course: "Physics", coursecode: "PHY1", coursemastercode: " MASTER1 ", student: "Student", regno: "R1" });
  assert.equal(row.validateSync(), undefined);
  assert.equal(row.coursemastercode, "MASTER1");
  assert.equal(row.coursecode, "PHY1");
  assert.equal(row.examcode, "EX1");
});
test("master code remains optional for existing forms and persists in submissions", () => {
  assert.equal(new Roll().coursemastercode, "");
  const submission = new Submission({ courses: [{ coursecode: "PHY1", coursemastercode: "MASTER1" }] });
  assert.equal(submission.toObject().courses[0].coursemastercode, "MASTER1");
  assert.equal(submission.courses[0].coursecode, "PHY1");
});
