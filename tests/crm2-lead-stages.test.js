const test = require('node:test');
const assert = require('node:assert/strict');
const { stageProgress, stages } = require('../utils/crm2LeadStages');
test('first persistence requires Identity and CRM, records progress and server timestamp', () => {
  const result = stageProgress(null, 'CRM Details');
  assert.deepEqual(result.wizardcompleted, ['Identity', 'CRM Details']);
  assert.equal(result.stage, 'Family & Address');
  assert.ok(result.stagetime instanceof Date);
  assert.throws(() => stageProgress(null, 'Identity'), /previous/);
  assert.throws(() => stageProgress(null, 'Documents'), /previous/);
});
test('later stages cannot be skipped and saved progress survives reloads', () => {
  let lead = stageProgress(null, 'CRM Details');
  assert.throws(() => stageProgress(lead, 'Programs interested'), /previous/);
  for (const stage of stages.slice(2)) lead = stageProgress(lead, stage);
  assert.equal(lead.stage, 'Lead notes');
  assert.deepEqual(lead.wizardcompleted, stages);
  assert.throws(() => stageProgress(lead, 'Unknown'), /Invalid/);
});
test('legacy leads stay accessible and subsequent saves acquire tracking', () => {
  const result = stageProgress({ name: 'Legacy' }, 'Lead notes');
  assert.deepEqual(result.wizardcompleted, stages);
  assert.equal(result.stage, 'Lead notes');
});
