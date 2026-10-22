const test = require("node:test"), assert = require("node:assert/strict");
const { applicantAttempt, applicantAttemptResponse } = require("../utils/admissionApplicantAttempt");
test("applicant responses contain attempt state but no score or question grading", () => {
  const attempt = { _id: "a1", examcontext: "Admission", status: "Submitted", submittime: "2026-10-22", marksobtained: 95, totalmarks: 100, percentage: 95, grade: "A", answers: [{ _id: "answer1", questionid: "q1", answertext: "My answer", marksobtained: 9, maxmarks: 10, gradingstatus: "Graded", aicomments: "Excellent", comments: "9/10", grade: "A" }] };
  const result = applicantAttemptResponse(attempt);
  assert.equal(result.status, "Submitted"); assert.equal(result.submittime, "2026-10-22");
  assert.equal(result.answers[0].answertext, "My answer");
  for (const field of ["marksobtained", "totalmarks", "percentage", "grade"]) assert.equal(result[field], undefined);
  for (const field of ["marksobtained", "maxmarks", "gradingstatus", "aicomments", "comments", "grade"]) assert.equal(result.answers[0][field], undefined);
  assert.equal(attempt.marksobtained, 95);
});
test("non-admission exam responses and staff data remain unchanged", () => {
  const attempt = { examcontext: "Student", marksobtained: 80 };
  assert.equal(applicantAttemptResponse(attempt), attempt);
  assert.equal(applicantAttempt(null), null);
});
test("mongoose documents are sanitized without modifying persisted marks", () => {
  const document = { toObject: () => ({ _id: "id", answers: [{ questionid: "q1", selectedoptionid: "o1", marksobtained: 1 }], marksobtained: 1 }) };
  assert.deepEqual(applicantAttempt(document).answers, [{ questionid: "q1", selectedoptionid: "o1" }]);
});
