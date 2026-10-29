const stages = ['Identity', 'CRM Details', 'Family & Address', 'Education & Work', 'Additional Details', 'Subjectwise Education', 'Documents', 'Programs interested', 'Applications', 'Interactions', 'Lead tasks', 'Lead notes'];
function stageProgress(existing, requested) {
  const stage = requested || existing?.stage || 'CRM Details';
  if (!stages.includes(stage)) throw Object.assign(new Error('Invalid lead wizard stage'), { status: 400 });
  // Existing leads without wizard progress stay accessible after this upgrade.
  const completed = existing ? (Array.isArray(existing.wizardcompleted) && existing.wizardcompleted.length ? existing.wizardcompleted : stages) : ['Identity'];
  const index = stages.indexOf(stage);
  if ((!existing && stage !== 'CRM Details') || !stages.slice(0, index).every(step => completed.includes(step))) throw Object.assign(new Error('Save the previous lead stage before continuing'), { status: 400 });
  return { stage: requested ? stages[Math.min(index + 1, stages.length - 1)] : stage, stagetime: new Date(), wizardcompleted: [...new Set([...completed, stage])] };
}
module.exports = { stages, stageProgress };
