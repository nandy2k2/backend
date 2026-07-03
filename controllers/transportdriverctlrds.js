const TransportDriver = require("../Models/transportdriverds");
const TransportDriverRoster = require("../Models/transportdriverrosterds");

const clean = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const regex = (value) => ({ $regex: clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });

const dateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const driverPayload = (body = {}) => ({
  colid: number(body.colid),
  name: clean(body.name),
  email: clean(body.email),
  phone: clean(body.phone),
  licenseno: clean(body.licenseno),
  licenseexpiry: dateOrNull(body.licenseexpiry),
  address: clean(body.address),
  assignedvehicle: clean(body.assignedvehicle),
  emergencycontact: clean(body.emergencycontact),
  status: clean(body.status) || "Active",
  user: clean(body.user)
});

const rosterPayload = (body = {}) => ({
  colid: number(body.colid),
  driverid: clean(body.driverid),
  drivername: clean(body.drivername),
  driveremail: clean(body.driveremail),
  vehicle: clean(body.vehicle),
  vehicleno: clean(body.vehicleno),
  route: clean(body.route),
  dutytype: clean(body.dutytype) || "Regular",
  startdatetime: dateOrNull(body.startdatetime),
  enddatetime: dateOrNull(body.enddatetime),
  notes: clean(body.notes),
  status: clean(body.status) || "Scheduled",
  user: clean(body.user)
});

exports.getDrivers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["status", "licenseno", "assignedvehicle"].forEach((field) => {
      if (clean(req.query[field])) query[field] = clean(req.query[field]);
    });
    ["name", "email", "phone"].forEach((field) => {
      if (clean(req.query[field])) query[field] = regex(req.query[field]);
    });
    const data = await TransportDriver.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveDriver = async (req, res) => {
  try {
    const payload = driverPayload(req.body);
    if (!payload.colid || !payload.name) return res.status(400).json({ success: false, message: "Driver name is required" });
    const data = req.body.id || req.body._id
      ? await TransportDriver.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await TransportDriver.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDriver = async (req, res) => {
  try {
    const data = await TransportDriver.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Driver not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRoster = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["driverid", "drivername", "driveremail", "vehicle", "vehicleno", "route", "status"].forEach((field) => {
      if (clean(req.query[field])) query[field] = field.includes("name") || field === "vehicle" || field === "route" ? regex(req.query[field]) : clean(req.query[field]);
    });
    const from = clean(req.query.fromdate);
    const to = clean(req.query.todate);
    if (from || to) {
      query.startdatetime = {};
      if (from) query.startdatetime.$gte = new Date(`${from}T00:00:00`);
      if (to) query.startdatetime.$lte = new Date(`${to}T23:59:59`);
    }
    const data = await TransportDriverRoster.find(query).sort({ startdatetime: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRoster = async (req, res) => {
  try {
    const payload = rosterPayload(req.body);
    if (!payload.colid || !payload.drivername || !payload.startdatetime || !payload.enddatetime) {
      return res.status(400).json({ success: false, message: "Driver, start date time and end date time are required" });
    }
    if (payload.enddatetime < payload.startdatetime) {
      return res.status(400).json({ success: false, message: "End date time must be after start date time" });
    }
    const data = req.body.id || req.body._id
      ? await TransportDriverRoster.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await TransportDriverRoster.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRoster = async (req, res) => {
  try {
    const data = await TransportDriverRoster.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Roster entry not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRosterOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [drivers, vehicles, statuses, routes] = await Promise.all([
      TransportDriver.find({ colid, status: { $ne: "Inactive" } }).sort({ name: 1 }).lean(),
      TransportDriverRoster.distinct("vehicleno", { colid }),
      TransportDriverRoster.distinct("status", { colid }),
      TransportDriverRoster.distinct("route", { colid })
    ]);
    res.json({
      success: true,
      data: {
        drivers,
        vehicles: vehicles.filter(Boolean).sort(),
        statuses: statuses.filter(Boolean).sort(),
        routes: routes.filter(Boolean).sort()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
