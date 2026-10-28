const yearScope = year => year ? { $or: [{ academicyear: String(year).trim() }, { 'programsinterested.academicyear': String(year).trim() }, { $and: [{ academicyear: { $in: [null, ''] } }, { programsinterested: { $not: { $elemMatch: { academicyear: { $nin: [null, ''] } } } } }] }] } : {};
const newAssignedScope = since => since ? { $or: [{ counsellorassignedat: { $gt: new Date(since) } }, { counsellorassignedat: null, createdAt: { $gt: new Date(since) } }] } : {};
const admittedScope = { $or: [{ admitted: 'Yes' }, { admissionstatus: 'Admitted' }] };
const dashboardIdentity = (input, req) => {
  if (!input.dashboardyear) return input;
  const token = String(req.get?.('authorization') || input.token || '').replace(/^Bearer\s+/i, '');
  const identity = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
  if (!identity.colid || !identity.user) throw new Error('Your user session is unavailable');
  return { ...input, colid: Number(identity.colid), user: String(identity.user).trim().toLowerCase(), leadmode: 'my' };
};
module.exports = { yearScope, newAssignedScope, admittedScope, dashboardIdentity };
