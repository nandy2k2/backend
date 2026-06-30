const UserProfileAuditLog = require('../Models/userprofileauditlogds');

const clean = (value) => String(value || '').trim();
const number = (value) => Number(value || 0);

const clientIp = (req) => clean(
  req.headers['x-forwarded-for']?.split(',')?.[0]
  || req.headers['x-real-ip']
  || req.ip
  || req.socket?.remoteAddress
);

exports.createAuditLog = async (req, payload = {}) => {
  try {
    if (!number(payload.colid)) return null;
    return await UserProfileAuditLog.create({
      ...payload,
      colid: number(payload.colid),
      ipaddress: clean(payload.ipaddress) || clientIp(req),
      activitytime: payload.activitytime || new Date()
    });
  } catch (err) {
    console.error('User profile audit log failed:', err.message);
    return null;
  }
};

exports.getLogs = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    const filter = { colid };
    ['action', 'requesttype', 'role', 'owneruser', 'actorname', 'actoremail', 'actorrole', 'field', 'status'].forEach((field) => {
      if (clean(req.query[field])) filter[field] = new RegExp(clean(req.query[field]), 'i');
    });
    if (clean(req.query.fromdate) || clean(req.query.todate)) {
      filter.activitytime = {};
      if (clean(req.query.fromdate)) filter.activitytime.$gte = new Date(req.query.fromdate);
      if (clean(req.query.todate)) {
        const toDate = new Date(req.query.todate);
        toDate.setHours(23, 59, 59, 999);
        filter.activitytime.$lte = toDate;
      }
    }
    const data = await UserProfileAuditLog.find(filter).sort({ activitytime: -1 }).limit(Number(req.query.limit || 2000)).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const field = clean(req.query.field);
    const allowed = new Set(['action', 'requesttype', 'role', 'owneruser', 'actorname', 'actoremail', 'actorrole', 'field', 'status']);
    if (!colid || !allowed.has(field)) return res.json([]);
    const values = await UserProfileAuditLog.distinct(field, { colid });
    res.json(values.filter((item) => item !== undefined && item !== null && clean(item)).sort());
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!ids.length) return res.status(400).json({ msg: 'Select at least one log' });
    const result = await UserProfileAuditLog.deleteMany({ colid, _id: { $in: ids } });
    res.json({ msg: 'Deleted', deleted: result.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
