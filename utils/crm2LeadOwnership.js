const DAY = 24 * 60 * 60 * 1000;
function reclaimable(lead, now = new Date()) {
  if (/^yes$/i.test(lead.admitted || '') || /^admitted$/i.test(lead.admissionstatus || '')) return false;
  const value = lead.dateadded || lead.createdAt;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) && now.getTime() - date.getTime() > 15 * DAY;
}
const ownerField = mode => mode === 'my' ? 'counselloremail' : mode === 'agent' ? 'agentemail' : null;
module.exports = { reclaimable, ownerField };
