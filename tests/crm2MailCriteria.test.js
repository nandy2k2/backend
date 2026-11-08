const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesMailCriteria: match } = require('../utils/crm2MailCriteria');
const { validateMailCriteria, extractMailPhone } = require('../utils/crm2MailCriteria');
test('subject and body modes ignore the unused criterion', () => {
  assert.equal(match('Admission', 'Other', { subject: 'admission', body: 'missing', matchMode: 'subject' }), true);
  assert.equal(match('Other', 'Admission', { subject: 'missing', body: 'admission', matchMode: 'body' }), true);
  assert.equal(match('Other', 'Admission', { subject: 'admission', body: 'admission', matchMode: 'subject' }), false);
  assert.equal(match('Admission', 'Other', { subject: 'admission', body: 'admission', matchMode: 'body' }), false);
});
test('both mode requires both nonempty matching criteria', () => {
  assert.equal(match('Admission', 'Prospectus', { subject: 'admission', body: 'prospectus', matchMode: 'both' }), true);
  assert.equal(match('Admission', 'Other', { subject: 'admission', body: 'prospectus', matchMode: 'both' }), false);
  assert.equal(match('Admission', 'Other', { subject: 'admission', body: '', matchMode: 'both' }), false);
  assert.throws(() => validateMailCriteria({ matchMode: 'both', subject: 'Admission' }), /body criteria/);
  assert.throws(() => validateMailCriteria({ matchMode: 'subject', body: 'Admission' }), /subject criteria/);
  assert.doesNotThrow(() => validateMailCriteria({ matchMode: 'body', body: 'Admission' }));
});
test('extracts phone numbers from body or subject and prefers labelled contacts', () => {
  assert.equal(extractMailPhone('Admission 9876543210', 'Hello'), '9876543210');
  assert.equal(extractMailPhone('Admission', 'Please call +91 98765 43210.'), '+919876543210');
  assert.equal(extractMailPhone('Ref 1234567890', 'Mobile number: +91-90081-68822'), '+919008168822');
  assert.equal(extractMailPhone('Phone: 9008168822', 'Hello'), '9008168822');
  assert.equal(extractMailPhone('Meeting 2026-11-07', 'Write to 9876543210@example.com'), '');
  assert.equal(extractMailPhone('Admission', 'Nothing here'), '');
});
test('both is the default and requires each supplied criterion', () => {
  assert.equal(match('Admissions', 'Request prospectus', { subject: 'admission', body: 'prospectus' }), true);
  assert.equal(match('Admissions', 'Other request', { subject: 'admission', body: 'prospectus' }), false);
});
test('any accepts either criterion but not neither', () => {
  const criteria = { subject: 'admission', body: 'prospectus', matchMode: 'any' };
  assert.equal(match('Admissions', 'Other request', criteria), true);
  assert.equal(match('Question', 'Request prospectus', criteria), true);
  assert.equal(match('Question', 'Other request', criteria), false);
});
test('empty criteria never match automatically in either mode', () => {
  for (const matchMode of ['all', 'any']) {
    assert.equal(match('Admissions', 'Text', { subject: ' ', body: '', matchMode }), false);
    assert.equal(match('Question', 'Text', { subject: 'Admissions', body: '', matchMode }), false);
    assert.equal(match('Admissions', 'Text', { subject: ' ADMISSIONS ', body: '', matchMode }), true);
    assert.equal(match('', 'Prospectus', { subject: '', body: 'prospectus', matchMode }), true);
  }
});
