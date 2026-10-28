const MenuAccess = require('../Models/menuaccessds');
module.exports = async function ensureCounselorAccess(user) {
  const role = String(user.role || '').trim().toLowerCase();
  if (!['counselor','counsellor','telecaller'].includes(role)) return;
  const telecaller = role === 'telecaller';
  await MenuAccess.updateOne({ colid: user.colid, role: user.role, path: telecaller ? '/telecaller-dashboard' : '/counsellor-dashboard' }, { $set: { menugroup: 'Dashboard', groupname: 'Dashboard', title: telecaller ? 'Telecaller dashboard' : 'Counsellor dashboard', access: 'Allow', user: user.email } }, { upsert: true, runValidators: true });
};
