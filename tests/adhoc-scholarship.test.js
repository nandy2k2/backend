const test = require('node:test');
const assert = require('node:assert/strict');
const { feeQuery, calculateAdjustment, ledgerEntryFromFee } = require('../controllers/adhocscholarshipctlrds')._test;

test('fee query is institution scoped and supports multivalue semester filters', () => {
  assert.deepEqual(feeQuery(42, [
    { field: 'academicyear', values: ['2026-27'] },
    { field: 'programcode', values: ['P1'] },
    { field: 'semester', values: ['1', '2'] }
  ]), {
    colid: 42,
    $and: [
      { academicyear: { $in: ['2026-27'] } },
      { programcode: { $in: ['P1'] } },
      { semester: { $in: ['1', '2'] } }
    ]
  });
});

test('fee query rejects fields outside the fee configuration whitelist', () => {
  assert.throws(() => feeQuery(42, [{ field: 'colid', values: ['99'] }]), /Invalid fee filter/);
});

test('ad-hoc concession recalculates balance from amount and paid', () => {
  assert.deepEqual(calculateAdjustment({ feeitem: 'Tuition', amount: 30000, paid: 5000 }, 2500), {
    concession: 2500,
    amount: 30000,
    paid: 5000,
    maximum: 25000,
    balance: 22500
  });
});

test('ad-hoc concession cannot exceed the unpaid portion', () => {
  assert.throws(() => calculateAdjustment({ feeitem: 'Tuition', amount: 30000, paid: 29000 }, 1001), /between 0 and 1000\.00/);
});

test('missing ledger item is initialized from fee configuration and student data', () => {
  const entry = ledgerEntryFromFee(
    { name: 'Student One', regno: 'R1', colid: 42, institution: 'Institute', academicyear: '2026-27', admissionyear: '2026-27', program: 'Science', programcode: 'P1', regulation: 'R2026', semester: '2' },
    { _id: 'fee-1', academicyear: '2026-27', program: 'Science', programcode: 'P1', regulation: 'R2026', semester: '2', feegroup: 'Academic', feecategory: 'Tuition', feeeitem: 'Semester Fee', amount: 12000, classdate: new Date('2026-11-01') },
    'admin@test.com'
  );
  assert.equal(entry.regno, 'R1');
  assert.equal(entry.feeid, 'fee-1');
  assert.equal(entry.amount, 12000);
  assert.equal(entry.balance, 12000);
  assert.equal(entry.type, 'positive');
  assert.equal(entry.user, 'admin@test.com');
});
