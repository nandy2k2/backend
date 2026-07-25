const RoomResource = require("../Models/roomresourceds");
const User = require("../Models/user");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const { EstateCampus, EstateRealEstate } = require("../Models/estatemanagementds");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const payload = (body = {}) => ({
  campus: text(body.campus || body.Campus),
  building: text(body.building || body.Building),
  floor: text(body.floor || body.Floor),
  roomno: text(body.roomno || body.roomNo || body["Room No"] || body.room),
  capacity: toNumber(body.capacity || body.Capacity) || 0,
  examcapacity: toNumber(body.examcapacity || body.examCapacity || body["Exam Capacity"]) || 0,
  type: text(body.type || body.Type) || "Classroom",
  labcourse: text(body.labcourse || body.labCourse || body["Lab Course"]),
  labcoursecode: text(body.labcoursecode || body.labCourseCode || body["Lab Course Code"]),
  roomownername: text(body.roomownername || body.roomOwnerName || body["Room Owner Name"]),
  roomowneremail: text(body.roomowneremail || body.roomOwnerEmail || body["Room Owner Email"]),
  colid: toNumber(body.colid),
  user: text(body.user)
});

const validate = (item) => {
  if (item.colid === undefined) return "colid is required";
  if (!item.campus) return "Campus is required";
  if (!item.building) return "Building is required";
  if (!item.floor) return "Floor is required";
  if (!item.roomno) return "Room no is required";
  return "";
};

const queryFrom = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["campus", "building", "floor", "roomno", "type", "labcourse", "labcoursecode", "roomowneremail"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [rooms, users, campuses, estateBuildings] = await Promise.all([
      RoomResource.find({ colid }).sort({ campus: 1, building: 1, floor: 1, roomno: 1 }).lean(),
      User.find({ colid }).select("name email user role department").sort({ name: 1, email: 1 }).lean(),
      EstateCampus.find({ colid, status: { $not: /^inactive$/i } }).sort({ campus: 1 }).lean(),
      EstateRealEstate.find({
        colid,
        status: { $not: /^inactive$/i },
        $or: [
          { estatetype: /building/i },
          { type: /building/i }
        ]
      }).sort({ location: 1, estatename: 1 }).lean()
    ]);
    const owners = users
      .filter((item) => text(item.role).toLowerCase() !== "student")
      .map((item) => ({ name: item.name || item.email || item.user || "", email: item.email || item.user || "", role: item.role || "", department: item.department || "" }))
      .filter((item) => item.email || item.name);
    res.json({
      success: true,
      rooms,
      owners,
      campuses,
      estateBuildings,
      campusnames: uniq([...campuses.map((item) => item.campus), ...rooms.map((item) => item.campus)]),
      buildings: uniq([...estateBuildings.map((item) => item.estatename), ...rooms.map((item) => item.building)]),
      floors: uniq(rooms.map((item) => item.floor)),
      roomnos: uniq(rooms.map((item) => item.roomno)),
      types: uniq(rooms.map((item) => item.type)),
      labcourses: uniq(rooms.map((item) => item.labcourse)),
      labcoursecodes: uniq(rooms.map((item) => item.labcoursecode))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await RoomResource.find(query).sort({ campus: 1, building: 1, floor: 1, roomno: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRoom = async (req, res) => {
  try {
    const item = payload(req.body);
    const error = validate(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await RoomResource.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await RoomResource.create(item);
    if (!data) return res.status(404).json({ success: false, message: "Room resource not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const data = await RoomResource.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Room resource not found" });
    res.json({ success: true, message: "Room resource deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkRooms = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    const valid = [];
    items.forEach((row, index) => {
      const item = payload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(item);
      if (error) errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
      else valid.push(item);
    });
    if (valid.length) await RoomResource.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.calendar = async (req, res) => {
  try {
    const query = { colid: toNumber(req.query.colid) };
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    ["campus", "building", "floor", "roomno", "roomid", "academicyear"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    if (req.query.fromdate || req.query.todate) {
      query.classdate = {};
      if (req.query.fromdate) query.classdate.$gte = req.query.fromdate;
      if (req.query.todate) query.classdate.$lte = req.query.todate;
    }
    const data = await NepLmsTimetable.find(query).sort({ classdate: 1, classtime: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
