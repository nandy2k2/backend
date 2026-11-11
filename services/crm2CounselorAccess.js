const MenuAccess = require('../Models/menuaccessds');
module.exports = async function ensureCounselorAccess(user) {
  const role = String(user.role || '').trim().toLowerCase();
  if (!['counselor','counsellor','telecaller','campusvisit'].includes(role)) return;
  if (role === 'campusvisit') return ensureQueueAccess(user);
  const telecaller = role === 'telecaller';
  await MenuAccess.updateOne({ colid: user.colid, role: user.role, path: telecaller ? '/telecaller-dashboard' : '/counsellor-dashboard' }, { $set: { menugroup: 'Dashboard', groupname: 'Dashboard', title: telecaller ? 'Telecaller dashboard' : 'Counsellor dashboard', access: 'Allow', user: user.email } }, { upsert: true, runValidators: true });
  if (!telecaller) for (const [path, title] of [['/crm2-my-campaigns', 'My campaigns'], ['/crm2-campaign-report', 'Campaign report']]) {
    await MenuAccess.updateOne({ colid: user.colid, role: user.role, path }, { $setOnInsert: { menugroup: 'CRM 2 Campaign', groupname: 'CRM 2 Campaign', title, access: 'Allow', user: user.email } }, { upsert: true, runValidators: true });
  }
  if (!telecaller) await ensureQueueAccess(user);
};
async function ensureQueueAccess(user) {
  for (const [path, title] of [['/crm2-select-queue-counter', 'Select queue counter'], ['/crm2-queue-counsellor', 'Queue counsellor']]) {
    await MenuAccess.updateOne({ colid: user.colid, role: user.role, path }, { $setOnInsert: { menugroup: 'CRM 2 Campus Queue', groupname: 'CRM 2 Campus Queue', title, access: 'Allow', user: user.email } }, { upsert: true, runValidators: true });
  }
}
