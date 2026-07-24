const myEmitter = require("./eventEmitter");
const ActivityPointConfig = require("../Models/activitypointconfigds");
const ActivityUserPoints = require("../Models/activityuserpointsds");
const User = require("../Models/user");
const MenuAccess = require("../Models/menuaccessds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameText = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");
const todayInput = () => new Date().toISOString().slice(0, 10);

const buildFilter = (source = {}) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  ["role", "activity", "status", "academicyear", "useremail", "user", "date"].forEach((field) => {
    if (source[field]) filter[field] = new RegExp(escapeRegex(source[field]), "i");
  });
  return filter;
};

exports.emitActivityEvent = (payload = {}) => {
  myEmitter.emit("activity_points_event", payload);
};

let listenerRegistered = false;
exports.registerActivityPointsProcessor = () => {
  if (listenerRegistered) return;
  listenerRegistered = true;
  myEmitter.on("activity_points_event", async (payload = {}) => {
    try {
      const colid = number(payload.colid);
      const activity = text(payload.activity);
      const useremail = text(payload.useremail || payload.user);
      if (colid === undefined || !activity || !useremail) return;

      const role = text(payload.role) || "Faculty";
      const config = await ActivityPointConfig.findOne({
        colid,
        activity: sameText(activity),
        status: /^Active$/i,
        $or: [{ role: sameText(role) }, { role: /^All$/i }]
      }).sort({ role: 1 }).lean();
      if (!config) return;

      const date = text(payload.date) || todayInput();
      const sourceid = text(payload.sourceid) || `${activity}-${useremail}-${date}`;
      await ActivityUserPoints.findOneAndUpdate(
        { colid, useremail, activity, date, sourceid },
        {
          colid,
          academicyear: text(payload.academicyear),
          user: text(payload.username || payload.name || payload.user),
          useremail,
          role,
          activity,
          date,
          points: number(config.points) || 0,
          source: text(payload.source),
          sourceid,
          status: "Active"
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      console.error("[activity_points_event]", error.message);
    }
  });
};

exports.listActivityPointConfigs = async (req, res) => {
  try {
    const data = await ActivityPointConfig.find(buildFilter(req.query)).sort({ role: 1, activity: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveActivityPointConfig = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = number(body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(body.role) || !text(body.activity)) return res.status(400).json({ success: false, message: "Role and activity are required" });
    const payload = {
      colid,
      role: text(body.role),
      activity: text(body.activity),
      points: number(body.points) || 0,
      status: text(body.status) || "Active",
      user: text(body.user),
      name: text(body.name)
    };
    const data = body._id
      ? await ActivityPointConfig.findByIdAndUpdate(body._id, payload, { new: true })
      : await ActivityPointConfig.findOneAndUpdate(
        { colid, role: payload.role, activity: payload.activity },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteActivityPointConfigs = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await ActivityPointConfig.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkActivityPointConfigs = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const colid = number(req.body.colid);
    const saved = [];
    for (const row of rows) {
      if (!text(row.role) || !text(row.activity)) continue;
      saved.push(await ActivityPointConfig.findOneAndUpdate(
        { colid, role: text(row.role), activity: text(row.activity) },
        {
          colid,
          role: text(row.role),
          activity: text(row.activity),
          points: number(row.points) || 0,
          status: text(row.status) || "Active",
          user: text(req.body.user)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ));
    }
    res.json({ success: true, saved: saved.length, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getActivityPointConfigOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const userQuery = colid === undefined ? {} : { colid };
    const configQuery = colid === undefined ? {} : { colid };
    const [userRoles, menuRoles, configRoles, activities] = await Promise.all([
      User.distinct("role", userQuery),
      MenuAccess.distinct("role", configQuery),
      ActivityPointConfig.distinct("role", configQuery),
      ActivityPointConfig.distinct("activity", configQuery)
    ]);
    const roleByLower = new Map();
    ["All", ...userRoles, ...menuRoles, ...configRoles].forEach((role) => {
      const value = text(role);
      if (!value || /^student$/i.test(value)) return;
      if (!roleByLower.has(value.toLowerCase())) roleByLower.set(value.toLowerCase(), value);
    });
    const roles = [...roleByLower.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    res.json({ success: true, roles, activities: activities.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listUserPoints = async (req, res) => {
  try {
    const data = await ActivityUserPoints.find(buildFilter(req.query)).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUserPointsOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const query = colid === undefined ? {} : { colid };
    const [roles, activities, years, users] = await Promise.all([
      ActivityUserPoints.distinct("role", query),
      ActivityUserPoints.distinct("activity", query),
      ActivityUserPoints.distinct("academicyear", query),
      ActivityUserPoints.distinct("user", query)
    ]);
    res.json({ success: true, roles, activities, years, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
