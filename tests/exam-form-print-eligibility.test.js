const test = require('node:test');
const assert = require('node:assert/strict');
const { examFormPrintEligibility } = require('../utils/examFormPrintEligibility');

test('printing is blocked when exam roll is absent', () => {
  const result = examFormPrintEligibility([]);
  assert.equal(result.eligible, false);
  assert.match(result.message, /no Exam Roll entry/i);
});

test('printing is blocked if any exam roll fee status is not Yes', () => {
  const result = examFormPrintEligibility([{ course: 'Physics', fees: 'Yes' }, { coursecode: 'C2', fees: 'No' }, { course: 'Chemistry', fees: '' }]);
  assert.equal(result.eligible, false);
  assert.equal(result.cleared, 1);
  assert.equal(result.pending, 2);
  assert.match(result.message, /C2/);
  assert.match(result.message, /Chemistry/);
});

test('printing is allowed only when every exam roll fee status is Yes', () => {
  assert.deepEqual(examFormPrintEligibility([{ fees: 'Yes' }, { fees: 'yes' }]), { eligible: true, total: 2, cleared: 2, pending: 0, message: '' });
});
