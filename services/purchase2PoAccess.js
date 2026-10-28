const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const Menu = require('../Models/menuaccessds');
const Workflow = require('../Models/storepoapprovalworkflowds2');
const esc = text => Array.from(String(text || '').trim(), char => '\\^$.*+?()[]{}|'.includes(char) ? `\\${char}` : char).join('');
async function staff(req) {
  const identity = jwt.verify(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET);
  const person = await User.findOne({ colid: Number(identity.colid), email: new RegExp(`^${esc(identity.user)}$`, 'i'), role: { $not: /^Student$/i } }).select('name email colid role').lean();
  if (!person) throw new Error('A staff login is required');
  const admin = /^All$/i.test(person.role) || !!await Menu.exists({ colid: person.colid, role: person.role, path: '/purchase2-manage-po-admin', access: 'Allow' });
  return { ...person, admin };
}
function canEdit(actor, po) {
  if (!actor.admin && String(po.creatorEmail || po.user || '').toLowerCase() !== String(actor.email).toLowerCase()) throw new Error('Only the PO creator or an authorized PO administrator can edit this draft');
}
async function canApprove(actor, po) {
  const levels = await Workflow.find({ colid: actor.colid, status: /^Active$/i }).sort({ level: 1 }).lean();
  const current = levels.find(row => Number(row.level) === Number(po.currentStep || levels[0]?.level || 1));
  if (!current || !actor.admin && String(current.approveremail).toLowerCase() !== actor.email.toLowerCase()) throw new Error('This PO is not pending with your approval level');
  return { current, next: levels.find(row => Number(row.level) > Number(current.level)) };
}
module.exports = { staff, canEdit, canApprove };
