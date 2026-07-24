const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const XLSX = require("xlsx");
const {
  EstateRealEstateType,
  EstateRealEstate,
  EstateServiceType,
  EstateMaintenanceSchedule,
  EstateServiceProvider,
  EstateVendorContract,
  EstateServiceAllocation,
  EstateServiceShift,
  EstateDailyRoster,
  EstateMeetingRoomFeature,
  EstateMeetingRoom,
  EstateMeetingRoomBooking
} = require("../Models/estatemanagementds");
const User = require("../Models/user");
const HrShiftTiming = require("../Models/hrshifttimingds");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Institution = require("../Models/insdetails");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const asArray = (value) => Array.isArray(value) ? value : text(value).split(",").map(text).filter(Boolean);
const asObjectArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!text(value)) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const configs = {
  types: {
    model: EstateRealEstateType,
    fields: ["typename", "description", "status"],
    required: ["typename"],
    sort: { typename: 1 }
  },
  estates: {
    model: EstateRealEstate,
    fields: ["estatename", "estatecode", "estatetype", "location", "address", "city", "state", "pincode", "area", "status"],
    required: ["estatename"],
    numeric: ["area"],
    sort: { estatetype: 1, estatename: 1 }
  },
  "service-types": {
    model: EstateServiceType,
    fields: ["servicetype", "description", "status"],
    required: ["servicetype"],
    sort: { servicetype: 1 }
  },
  maintenance: {
    model: EstateMaintenanceSchedule,
    fields: ["estateid", "estatename", "estatecode", "estatetype", "location", "servicedate", "starttime", "endtime", "frequency", "servicetype", "hours", "noofpeople", "description", "status"],
    required: ["estatename", "servicetype"],
    numeric: ["hours", "noofpeople"],
    sort: { servicedate: -1, starttime: 1 }
  },
  providers: {
    model: EstateServiceProvider,
    fields: ["servicetype", "providername", "providertype", "contactperson", "email", "phone", "status"],
    required: ["providername"],
    sort: { servicetype: 1, providername: 1 }
  },
  contracts: {
    model: EstateVendorContract,
    fields: ["providerid", "providername", "servicetype", "contracttype", "startdate", "enddate", "amount", "description", "documentlink", "status"],
    required: ["providername"],
    numeric: ["amount"],
    sort: { enddate: -1, providername: 1 }
  },
  allocations: {
    model: EstateServiceAllocation,
    fields: ["providerid", "providername", "servicetype", "employeename", "employeeemail", "employeephone", "department", "role", "status"],
    required: ["providername", "employeeemail"],
    sort: { servicetype: 1, employeename: 1 }
  },
  shifts: {
    model: EstateServiceShift,
    fields: ["allocationid", "servicetype", "employeename", "employeeemail", "shiftid", "location", "shift", "starttime", "endtime", "status"],
    required: ["employeeemail", "shift"],
    sort: { servicetype: 1, employeename: 1 }
  },
  rosters: {
    model: EstateDailyRoster,
    fields: ["rosterdate", "estateid", "estatename", "estatecode", "location", "servicetype", "employeename", "employeeemail", "shift", "starttime", "endtime", "hours", "source", "notes", "status"],
    required: ["rosterdate", "estatename", "servicetype", "employeeemail"],
    numeric: ["hours"],
    sort: { rosterdate: -1, starttime: 1, estatename: 1 }
  },
  "meeting-features": {
    model: EstateMeetingRoomFeature,
    fields: ["feature", "description", "status"],
    required: ["feature"],
    sort: { feature: 1 }
  },
  "meeting-rooms": {
    model: EstateMeetingRoom,
    fields: ["buildingid", "building", "location", "roomname", "roomcode", "ownername", "owneremail", "capacity", "features", "status"],
    required: ["roomname"],
    numeric: ["capacity"],
    arrays: ["features"],
    sort: { building: 1, roomname: 1 }
  },
  "meeting-bookings": {
    model: EstateMeetingRoomBooking,
    fields: ["roomid", "roomname", "roomcode", "building", "location", "meetingtitle", "bookedbyname", "bookedbyemail", "bookingdate", "fromtime", "totime", "capacityrequired", "featuresrequired", "sharedservices", "purpose", "status"],
    required: ["roomid", "meetingtitle", "bookingdate", "fromtime", "totime"],
    numeric: ["capacityrequired"],
    arrays: ["featuresrequired", "sharedservices"],
    sort: { bookingdate: -1, fromtime: 1 }
  }
};

const cfg = (name) => configs[text(name)] || null;

const buildPayload = (config, body = {}) => {
  const payload = {
    colid: Number(body.colid),
    user: text(body.user),
    name: text(body.name)
  };
  (config.fields || []).forEach((field) => {
    if ((config.arrays || []).includes(field)) {
      payload[field] = asArray(body[field]);
    } else {
      payload[field] = (config.numeric || []).includes(field) ? num(body[field]) : text(body[field]);
    }
  });
  return payload;
};

const buildQuery = (config, source = {}) => {
  const query = {};
  if (source.colid) query.colid = Number(source.colid);
  (config.fields || []).forEach((field) => {
    if (source[field]) query[field] = text(source[field]);
  });
  if (source.features) query.features = { $all: asArray(source.features) };
  if (source.featuresrequired) query.featuresrequired = { $all: asArray(source.featuresrequired) };
  if (source.mincapacity) query.capacity = { ...(query.capacity || {}), $gte: num(source.mincapacity) };
  if (source.capacityrequired) query.capacity = { ...(query.capacity || {}), $gte: num(source.capacityrequired) };
  if (source.fromdate || source.todate) {
    const dateField = source.datefield || (config === configs.rosters ? "rosterdate" : config === configs.maintenance ? "servicedate" : "");
    if (dateField) {
      query[dateField] = {};
      if (source.fromdate) query[dateField].$gte = text(source.fromdate);
      if (source.todate) query[dateField].$lte = text(source.todate);
    }
  }
  return query;
};

const validatePayload = (config, payload) => {
  if (!payload.colid) return "colid is required";
  const missing = (config.required || []).find((field) => !payload[field]);
  return missing ? `${missing} is required` : "";
};

const parseWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};

exports.list = async (req, res) => {
  try {
    const config = cfg(req.params.module);
    if (!config) return res.status(404).json({ success: false, message: "Estate module not found" });
    const query = buildQuery(config, req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await config.model.find(query).sort(config.sort || { updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const config = cfg(req.params.module);
    if (!config) return res.status(404).json({ success: false, message: "Estate module not found" });
    const payload = buildPayload(config, req.body);
    const validation = validatePayload(config, payload);
    if (validation) return res.status(400).json({ success: false, message: validation });
    const data = req.body.id
      ? await config.model.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await config.model.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const config = cfg(req.params.module);
    if (!config) return res.status(404).json({ success: false, message: "Estate module not found" });
    const data = await config.model.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const config = cfg(req.params.module);
    if (!config) return res.status(404).json({ success: false, message: "Estate module not found" });
    const colid = Number(req.body.colid);
    const ids = asArray(req.body.ids);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one record" });
    const result = await config.model.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const config = cfg(req.params.module);
    if (!config) return res.status(404).json({ success: false, message: "Estate module not found" });
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = parseWorkbook(req.file.buffer);
    const payloads = rows.map((row) => buildPayload(config, { ...row, colid: req.body.colid, user: req.body.user, name: req.body.name }));
    const validRows = payloads.filter((payload) => !validatePayload(config, payload));
    if (!validRows.length) return res.status(400).json({ success: false, message: "No valid rows found" });
    const inserted = await config.model.insertMany(validRows, { ordered: false });
    res.json({ success: true, inserted: inserted.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const serviceTypes = await EstateServiceType.find({ colid }).sort({ servicetype: 1 }).lean();
    const realEstateTypes = await EstateRealEstateType.find({ colid }).sort({ typename: 1 }).lean();
    const estates = await EstateRealEstate.find({ colid }).sort({ estatename: 1 }).lean();
    const providers = await EstateServiceProvider.find({ colid }).sort({ providername: 1 }).lean();
    const allocations = await EstateServiceAllocation.find({ colid, status: { $ne: "Inactive" } }).sort({ employeename: 1 }).lean();
    const shifts = await HrShiftTiming.find({ colid }).sort({ location: 1, shift: 1 }).lean();
    const meetingFeatures = await EstateMeetingRoomFeature.find({ colid, status: { $ne: "Inactive" } }).sort({ feature: 1 }).lean();
    const meetingRooms = await EstateMeetingRoom.find({ colid, status: { $ne: "Inactive" } }).sort({ building: 1, roomname: 1 }).lean();
    const ollamaConfigs = await OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean();
    res.json({
      success: true,
      serviceTypes,
      realEstateTypes,
      estates,
      providers,
      allocations,
      shifts,
      meetingFeatures,
      meetingRooms,
      ollamaConfigs,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const timeToMinutes = (value) => {
  const [hours, minutes] = text(value).split(":").map((item) => Number(item || 0));
  return (hours * 60) + minutes;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);

exports.searchMeetingRooms = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, status: { $ne: "Inactive" } };
    ["building", "location", "roomname", "roomcode"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    if (text(req.query.features)) query.features = { $all: asArray(req.query.features) };
    if (text(req.query.capacity)) query.capacity = { $gte: num(req.query.capacity) };
    const rooms = await EstateMeetingRoom.find(query).sort({ building: 1, roomname: 1 }).lean();
    const date = text(req.query.bookingdate);
    const fromtime = text(req.query.fromtime);
    const totime = text(req.query.totime);
    const bookings = date ? await EstateMeetingRoomBooking.find({ colid, bookingdate: date, status: { $nin: ["Cancelled", "Inactive"] } }).lean() : [];
    const data = rooms.map((room) => {
      const conflicts = bookings.filter((booking) => String(booking.roomid) === String(room._id) && fromtime && totime && overlaps(fromtime, totime, booking.fromtime, booking.totime));
      return { ...room, available: conflicts.length ? "No" : "Yes", conflictcount: conflicts.length };
    }).filter((room) => room.available === "Yes");
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveMeetingBooking = async (req, res) => {
  try {
    const payload = buildPayload(configs["meeting-bookings"], req.body);
    payload.sharedservicedetails = asObjectArray(req.body.sharedservicedetails)
      .map((item) => ({ service: text(item.service), noofpeople: Math.max(1, num(item.noofpeople || 1)) }))
      .filter((item) => item.service);
    if (payload.sharedservicedetails.length) {
      payload.sharedservices = payload.sharedservicedetails.map((item) => item.service);
    }
    const validation = validatePayload(configs["meeting-bookings"], payload);
    if (validation) return res.status(400).json({ success: false, message: validation });
    const conflictQuery = {
      colid: payload.colid,
      roomid: payload.roomid,
      bookingdate: payload.bookingdate,
      status: { $nin: ["Cancelled", "Inactive"] }
    };
    if (req.body.id) conflictQuery._id = { $ne: req.body.id };
    const existing = await EstateMeetingRoomBooking.find(conflictQuery).lean();
    const conflict = existing.find((booking) => overlaps(payload.fromtime, payload.totime, booking.fromtime, booking.totime));
    if (conflict) return res.status(400).json({ success: false, message: `Room already booked from ${conflict.fromtime} to ${conflict.totime}` });
    const data = req.body.id
      ? await EstateMeetingRoomBooking.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await EstateMeetingRoomBooking.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.distinct = async (req, res) => {
  try {
    const config = cfg(req.params.module);
    if (!config) return res.status(404).json({ success: false, message: "Estate module not found" });
    const colid = Number(req.query.colid);
    const result = {};
    for (const field of config.fields || []) {
      result[field] = (await config.model.distinct(field, { colid })).filter(Boolean).sort();
    }
    res.json({ success: true, options: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const query = { colid, role: { $not: /^student$/i } };
    ["department", "role", "designation", "status"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    const term = text(req.query.search);
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i");
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { department: rx }, { role: rx }];
    }
    const users = await User.find(query).select("name email phone department role designation status").sort({ name: 1 }).limit(500).lean();
    const distinct = {};
    for (const field of ["department", "role", "designation"]) {
      distinct[field] = (await User.distinct(field, { colid, role: { $not: /^student$/i } })).filter(Boolean).sort();
    }
    res.json({ success: true, users, distinct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listMeetingRoomFeatures = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    if (text(req.query.feature)) query.feature = text(req.query.feature);
    if (text(req.query.status)) query.status = text(req.query.status);
    const data = await EstateMeetingRoomFeature.find(query).sort({ feature: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveMeetingRoomFeature = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const feature = text(req.body.feature);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!feature) return res.status(400).json({ success: false, message: "Feature is required" });
    const payload = {
      colid,
      user: text(req.body.user),
      name: text(req.body.name),
      feature,
      description: text(req.body.description),
      status: text(req.body.status) || "Active"
    };
    const data = req.body.id
      ? await EstateMeetingRoomFeature.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await EstateMeetingRoomFeature.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Feature not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMeetingRoomFeature = async (req, res) => {
  try {
    const data = await EstateMeetingRoomFeature.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Feature not found" });
    res.json({ success: true, message: "Feature deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkMeetingRoomFeatures = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = parseWorkbook(req.file.buffer);
    const payloads = rows.map((row) => ({
      colid,
      user: text(req.body.user),
      name: text(req.body.name),
      feature: text(row.feature || row.Feature),
      description: text(row.description || row.Description),
      status: text(row.status || row.Status) || "Active"
    })).filter((row) => row.feature);
    if (!payloads.length) return res.status(400).json({ success: false, message: "No valid feature rows found" });
    const inserted = await EstateMeetingRoomFeature.insertMany(payloads, { ordered: false });
    res.json({ success: true, inserted: inserted.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkMeetingBookings = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = parseWorkbook(req.file.buffer);
    const payloads = [];
    const skipped = [];

    for (const row of rows) {
      const room = await findMeetingRoomForBooking(colid, row);
      const bookingdate = text(row.bookingdate || row.BookingDate || row.date || row.Date);
      const fromtime = text(row.fromtime || row.FromTime || row.from || row.From);
      const totime = text(row.totime || row.ToTime || row.to || row.To);
      const meetingtitle = text(row.meetingtitle || row.MeetingTitle || row.title || row.Title);
      if (!room || !bookingdate || !fromtime || !totime || !meetingtitle) {
        skipped.push({ row, reason: "Room, date, from time, to time and meeting title are required" });
        continue;
      }
      const existing = await EstateMeetingRoomBooking.find({
        colid,
        roomid: String(room._id),
        bookingdate,
        status: { $nin: ["Cancelled", "Inactive"] }
      }).lean();
      const uploadConflict = payloads.find((item) => String(item.roomid) === String(room._id) && item.bookingdate === bookingdate && overlaps(fromtime, totime, item.fromtime, item.totime));
      const dbConflict = existing.find((item) => overlaps(fromtime, totime, item.fromtime, item.totime));
      if (uploadConflict || dbConflict) {
        skipped.push({ row, reason: `Room already booked for ${bookingdate} ${fromtime}-${totime}` });
        continue;
      }
      const sharedservicedetails = parseSharedServiceDetails(row);
      payloads.push({
        colid,
        user: text(req.body.user),
        name: text(req.body.name),
        roomid: String(room._id),
        roomname: room.roomname,
        roomcode: room.roomcode,
        building: room.building,
        location: room.location,
        meetingtitle,
        bookedbyname: text(row.bookedbyname || row.BookedByName || req.body.name),
        bookedbyemail: text(row.bookedbyemail || row.BookedByEmail || req.body.user),
        bookingdate,
        fromtime,
        totime,
        capacityrequired: num(row.capacityrequired || row.CapacityRequired || 0),
        featuresrequired: asArray(row.featuresrequired || row.FeaturesRequired),
        sharedservices: sharedservicedetails.map((item) => item.service),
        sharedservicedetails,
        purpose: text(row.purpose || row.Purpose),
        status: text(row.status || row.Status) || "Booked"
      });
    }

    const inserted = payloads.length ? await EstateMeetingRoomBooking.insertMany(payloads, { ordered: false }) : [];
    res.json({ success: true, inserted: inserted.length, skipped: skipped.length, skippedRows: skipped.slice(0, 25), data: inserted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();

exports.uploadContractDocument = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "Document is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/estate-management/contracts/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({
      success: true,
      documentlink: s3Url(config.bucket, config.region, key),
      file: {
        awsconfigid: String(config._id),
        bucket: config.bucket,
        region: config.region,
        key,
        filename: cleanName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addMinutes = (time, minutes) => {
  const [h, m] = text(time || "09:00").split(":").map((item) => Number(item || 0));
  const total = (h * 60) + m + Number(minutes || 0);
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const minutesToTime = (minutes) => {
  const total = Math.max(0, Math.min(24 * 60, Math.round(Number(minutes || 0))));
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const hoursBetween = (fromtime, totime) => {
  const diff = timeToMinutes(totime) - timeToMinutes(fromtime);
  return diff > 0 ? Number((diff / 60).toFixed(2)) : 1;
};

const datesBetween = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
};

const meetingBookingRequirements = (bookings = []) => bookings.flatMap((booking) => {
  const serviceDetails = asObjectArray(booking.sharedservicedetails);
  const services = serviceDetails.length
    ? serviceDetails.map((item) => ({ service: text(item.service), noofpeople: Math.max(1, num(item.noofpeople || 1)) })).filter((item) => item.service)
    : asArray(booking.sharedservices).map((service) => ({ service, noofpeople: 1 }));
  return services.map((item) => ({
    rosterdate: booking.bookingdate,
    estateid: booking.roomid,
    estatename: `${booking.building || "Meeting room"} - ${booking.roomname || ""}`.trim(),
    estatecode: booking.roomcode,
    location: booking.location,
    servicetype: item.service,
    starttime: booking.fromtime,
    endtime: booking.totime,
    hours: hoursBetween(booking.fromtime, booking.totime),
    noofpeople: item.noofpeople,
    sourcecontext: "Meeting booking",
    notes: `Meeting: ${booking.meetingtitle || ""}${booking.purpose ? ` | ${booking.purpose}` : ""} | People required: ${item.noofpeople}`
  }));
});

const parseSharedServiceDetails = (row = {}) => {
  const explicit = asObjectArray(row.sharedservicedetails || row.SharedServiceDetails);
  if (explicit.length) {
    return explicit
      .map((item) => ({ service: text(item.service || item.Service), noofpeople: Math.max(1, num(item.noofpeople || item.NoOfPeople || 1)) }))
      .filter((item) => item.service);
  }
  const pairText = text(row.sharedservicepeople || row.SharedServicePeople);
  if (pairText) {
    return pairText.split(",").map((part) => {
      const [service, people] = part.split(":");
      return { service: text(service), noofpeople: Math.max(1, num(people || 1)) };
    }).filter((item) => item.service);
  }
  return asArray(row.sharedservices || row.SharedServices).map((service) => ({ service, noofpeople: 1 }));
};

const findMeetingRoomForBooking = async (colid, row = {}) => {
  if (text(row.roomid || row.RoomId)) {
    const id = text(row.roomid || row.RoomId);
    if (/^[a-f\d]{24}$/i.test(id)) {
      const room = await EstateMeetingRoom.findOne({ _id: id, colid }).lean();
      if (room) return room;
    }
  }
  const query = { colid, status: { $ne: "Inactive" } };
  if (text(row.roomcode || row.RoomCode)) query.roomcode = text(row.roomcode || row.RoomCode);
  if (text(row.roomname || row.RoomName)) query.roomname = text(row.roomname || row.RoomName);
  if (text(row.building || row.Building)) query.building = text(row.building || row.Building);
  return EstateMeetingRoom.findOne(query).lean();
};

const requirementDates = (requirement, dates) => {
  const exactDate = text(requirement.rosterdate || requirement.servicedate);
  if (exactDate) return dates.includes(exactDate) ? [exactDate] : [];
  return dates;
};

const rosterRequirementKey = (row = {}) => [
  text(row.rosterdate || row.servicedate),
  text(row.estateid || row.estatename),
  text(row.servicetype),
  text(row.starttime),
  text(row.endtime)
].join("|").toLowerCase();

const sameRosterRequirement = (row = {}, requirement = {}, date = "") => {
  const rowEstate = text(row.estateid || row.estatename).toLowerCase();
  const reqEstate = text(requirement.estateid || requirement.estatename).toLowerCase();
  return text(row.rosterdate || row.servicedate) === text(date)
    && text(row.servicetype).toLowerCase() === text(requirement.servicetype).toLowerCase()
    && (!reqEstate || !rowEstate || rowEstate === reqEstate);
};

const personHasOverlap = (rows, employeeemail, rosterdate, starttime, endtime) => rows.some((row) => (
  text(row.employeeemail).toLowerCase() === text(employeeemail).toLowerCase()
  && text(row.rosterdate) === text(rosterdate)
  && overlaps(starttime, endtime, row.starttime, row.endtime)
));

const freeIntervalsForShift = (shift = {}, rows = [], rosterdate = "", windowStart = "", windowEnd = "") => {
  if (!text(shift.employeeemail) || !text(shift.starttime) || !text(shift.endtime) || !windowStart || !windowEnd) return [];
  const start = Math.max(timeToMinutes(windowStart), timeToMinutes(shift.starttime));
  const end = Math.min(timeToMinutes(windowEnd), timeToMinutes(shift.endtime));
  if (end <= start) return [];
  const busy = rows
    .filter((row) => text(row.employeeemail).toLowerCase() === text(shift.employeeemail).toLowerCase() && text(row.rosterdate) === text(rosterdate))
    .map((row) => [Math.max(start, timeToMinutes(row.starttime)), Math.min(end, timeToMinutes(row.endtime))])
    .filter(([busyStart, busyEnd]) => busyEnd > busyStart)
    .sort((a, b) => a[0] - b[0]);
  const free = [];
  let cursor = start;
  busy.forEach(([busyStart, busyEnd]) => {
    if (busyStart > cursor) free.push([cursor, busyStart]);
    cursor = Math.max(cursor, busyEnd);
  });
  if (cursor < end) free.push([cursor, end]);
  return free;
};

const allocatedMinutesForRequirement = (rows = [], requirement = {}, date = "", windowStart = "", windowEnd = "") => rows.reduce((sum, row) => {
  if (row.status === "Unassigned" || !sameRosterRequirement(row, requirement, date)) return sum;
  const start = Math.max(timeToMinutes(row.starttime), timeToMinutes(windowStart));
  const end = Math.min(timeToMinutes(row.endtime), timeToMinutes(windowEnd));
  return sum + Math.max(0, end - start);
}, 0);

const requirementWindow = (requirement = {}) => {
  const hours = Math.max(0.25, num(requirement.hours || 1));
  const starttime = text(requirement.starttime) || "09:00";
  const endtime = text(requirement.endtime) || addMinutes(starttime, hours * 60);
  return { starttime, endtime, hours };
};

const shiftCoversTiming = (shift = {}, starttime, endtime) => {
  const start = text(starttime);
  const end = text(endtime);
  if (!start || !end) return true;
  if (!text(shift.starttime) || !text(shift.endtime)) return false;
  return timeToMinutes(shift.starttime) <= timeToMinutes(start) && timeToMinutes(shift.endtime) >= timeToMinutes(end);
};

const rowHasValidShiftTiming = (row = {}, shiftRows = []) => {
  const email = text(row.employeeemail).toLowerCase();
  if (!email || /^unassigned-/.test(email)) return true;
  const shifts = shiftRows.filter((shift) => text(shift.employeeemail).toLowerCase() === email);
  if (!shifts.length) return false;
  return shifts.some((shift) => shiftCoversTiming(shift, row.starttime, row.endtime));
};

const deterministicRoster = (dates, requirementRows, shiftRows, existingRows = []) => {
  const activeShifts = shiftRows.filter((row) => row.employeeemail);
  if (!activeShifts.length) return [];
  let index = 0;
  const generated = [];
  requirementRows.forEach((maintenance) => {
    requirementDates(maintenance, dates).forEach((date) => {
      const { starttime: requiredStart, endtime: requiredEnd, hours } = requirementWindow(maintenance);
      const people = Math.max(1, Math.floor(num(maintenance.noofpeople || 1)));
      const requestedMinutes = Math.max(15, Math.round(hours * 60)) * people;
      const alreadyAllocated = allocatedMinutesForRequirement(existingRows, maintenance, date, requiredStart, requiredEnd);
      let remainingMinutes = Math.max(0, requestedMinutes - alreadyAllocated);
      if (!remainingMinutes) return;
      const serviceCandidates = activeShifts.filter((shift) => !maintenance.servicetype || text(shift.servicetype).toLowerCase() === text(maintenance.servicetype).toLowerCase());
      const candidates = serviceCandidates.filter((shift) => freeIntervalsForShift(shift, [...existingRows, ...generated], date, requiredStart, requiredEnd).length);
      const pool = candidates.length ? candidates : activeShifts.filter((shift) => freeIntervalsForShift(shift, [...existingRows, ...generated], date, requiredStart, requiredEnd).length);
      let allocatedMinutes = 0;
      let attempts = 0;
      if (!pool.length) attempts = 1;
      while (remainingMinutes > 0 && attempts < Math.max(pool.length * 4, 1)) {
        const assigned = pool[(index + attempts) % pool.length];
        attempts += 1;
        if (!assigned) continue;
        const interval = freeIntervalsForShift(assigned, [...existingRows, ...generated], date, requiredStart, requiredEnd)[0];
        if (!interval) continue;
        const chunkMinutes = Math.min(remainingMinutes, interval[1] - interval[0]);
        if (chunkMinutes <= 0) continue;
        const starttime = minutesToTime(interval[0]);
        const endtime = minutesToTime(interval[0] + chunkMinutes);
        generated.push({
          rosterdate: date,
          estateid: maintenance.estateid,
          estatename: maintenance.estatename,
          estatecode: maintenance.estatecode,
          location: maintenance.location,
          servicetype: maintenance.servicetype || assigned.servicetype,
          employeename: assigned.employeename,
          employeeemail: assigned.employeeemail,
          shift: assigned.shift,
          starttime,
          endtime,
          hours: Number((chunkMinutes / 60).toFixed(2)),
          source: "Auto",
          notes: `${maintenance.notes || `Generated from ${maintenance.sourcecontext || "maintenance schedule"}.`} Requested window: ${requiredStart}-${requiredEnd}. Requested person-hours: ${Number((requestedMinutes / 60).toFixed(2))}.`,
          status: "Planned"
        });
        allocatedMinutes += chunkMinutes;
        remainingMinutes -= chunkMinutes;
      }
      if (remainingMinutes > 0) {
        const unassignedEnd = timeToMinutes(requiredStart) + remainingMinutes <= timeToMinutes(requiredEnd)
          ? addMinutes(requiredStart, remainingMinutes)
          : requiredEnd;
        generated.push({
          rosterdate: date,
          estateid: maintenance.estateid,
          estatename: maintenance.estatename,
          estatecode: maintenance.estatecode,
          location: maintenance.location,
          servicetype: maintenance.servicetype,
          employeename: "UNASSIGNED",
          employeeemail: `unassigned-${Date.now()}-${generated.length}`,
          shift: "",
          starttime: requiredStart,
          endtime: unassignedEnd,
          hours: Number((remainingMinutes / 60).toFixed(2)),
          source: "Auto",
          notes: `${maintenance.notes || `Generated from ${maintenance.sourcecontext || "maintenance schedule"}.`} Requested window: ${requiredStart}-${requiredEnd}. Requested person-hours: ${Number((requestedMinutes / 60).toFixed(2))}. Existing allocated hours: ${Number((alreadyAllocated / 60).toFixed(2))}. Newly allocated hours: ${Number((allocatedMinutes / 60).toFixed(2))}. Remaining unassigned hours: ${Number((remainingMinutes / 60).toFixed(2))}.`,
          status: "Unassigned"
        });
      }
      index += allocatedMinutes > 0 ? 1 : 0;
    });
  });
  return generated;
};

const normalizeRosterByRequirements = (candidateRows, dates, requirementRows, shiftRows, existingRows = []) => {
  const normalized = [];
  (candidateRows || []).forEach((row) => {
    const matched = requirementRows.flatMap((requirement) => requirementDates(requirement, dates).map((date) => ({ requirement, date })))
      .find(({ requirement, date }) => {
        const { starttime, endtime } = requirementWindow(requirement);
        return sameRosterRequirement(row, requirement, date)
          && timeToMinutes(row.starttime) >= timeToMinutes(starttime)
          && timeToMinutes(row.endtime) <= timeToMinutes(endtime);
      });
    if (!matched) return;
    const { starttime, endtime, hours } = requirementWindow(matched.requirement);
    const people = Math.max(1, Math.floor(num(matched.requirement.noofpeople || 1)));
    const requestedMinutes = Math.max(15, Math.round(hours * 60)) * people;
    const currentAllocated = allocatedMinutesForRequirement([...existingRows, ...normalized], matched.requirement, matched.date, starttime, endtime);
    const remaining = requestedMinutes - currentAllocated;
    if (remaining <= 0) return;
    if (!rowHasValidShiftTiming(row, shiftRows)) return;
    if (personHasOverlap([...existingRows, ...normalized], row.employeeemail, row.rosterdate, row.starttime, row.endtime)) return;
    const rowMinutes = timeToMinutes(row.endtime) - timeToMinutes(row.starttime);
    const minutesToUse = Math.min(remaining, rowMinutes);
    if (minutesToUse <= 0) return;
    normalized.push({
      ...row,
      endtime: addMinutes(row.starttime, minutesToUse),
      hours: Number((minutesToUse / 60).toFixed(2))
    });
  });
  const fallback = deterministicRoster(dates, requirementRows, shiftRows, [...existingRows, ...normalized]);
  return [...normalized, ...fallback];
};

const getGeminiConfig = async (colid) => AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();

const getOllamaConfig = async (colid, id) => {
  const query = { colid: Number(colid), active: /^yes$/i };
  if (text(id)) {
    const selected = await OllamaConfiguration.findOne({ ...query, _id: id }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
};

const callGemini = async (apikey, prompt, preferredModel) => {
  const models = [...new Set([text(preferredModel), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25 } })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini failed for ${model}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: text(config.modelname), prompt, stream: false, options: { temperature: 0.25 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const parseAiRoster = (raw) => {
  const clean = text(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : parsed.roster || [];
};

exports.generateRoster = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const fromdate = text(req.body.fromdate);
    const todate = text(req.body.todate);
    if (!colid || !fromdate || !todate) return res.status(400).json({ success: false, message: "colid, from date and to date are required" });
    const dates = datesBetween(fromdate, todate);
    if (!dates.length) return res.status(400).json({ success: false, message: "Invalid date range" });

    const maintenance = await EstateMaintenanceSchedule.find({ colid, status: { $ne: "Inactive" } }).lean();
    const meetingBookings = await EstateMeetingRoomBooking.find({
      colid,
      bookingdate: { $gte: fromdate, $lte: todate },
      status: { $nin: ["Cancelled", "Inactive"] }
    }).lean();
    const meetingRequirements = meetingBookingRequirements(meetingBookings);
    const requirements = [...maintenance, ...meetingRequirements];
    const shifts = await EstateServiceShift.find({ colid, status: { $ne: "Inactive" } }).lean();
    const existingRoster = await EstateDailyRoster.find({
      colid,
      rosterdate: { $gte: fromdate, $lte: todate },
      status: { $nin: ["Cancelled", "Inactive"] }
    }).lean();
    if (!requirements.length) return res.status(400).json({ success: false, message: "No maintenance requirements or meeting room service bookings found" });
    if (!shifts.length) return res.status(400).json({ success: false, message: "No service personnel shifts found" });

    let roster = deterministicRoster(dates, requirements, shifts, existingRoster);
    let aiResponse = "";
    const provider = text(req.body.provider);
    const promptText = text(req.body.prompt);
    if (provider && provider !== "Manual") {
      const prompt = `Create a daily shared-service estate roster as JSON array only.
Each object must include: rosterdate, estateid, estatename, estatecode, location, servicetype, employeename, employeeemail, shift, starttime, endtime, hours, notes.
Date range: ${fromdate} to ${todate}
Rules from user: ${promptText || "Use available personnel shift timing, service type fit, maintenance required hours per estate per day, and avoid double booking the same employee at the same time."}
Strict rules:
- Treat starttime and endtime as the allowed service window, not necessarily the full duty duration.
- hours is the requested duty duration per person; noofpeople is the requested number of people. Total requested work is hours * noofpeople person-hours.
- Assign only the requested person-hours inside the allowed window. Example: hours 3, noofpeople 1, window 09:00-18:00 means any 3 available hours inside that window is acceptable.
- Partial assignment is allowed when full assignment is not possible.
- One duty may be split across multiple employees when one employee cannot cover the full requested duration.
- Do not assign the same employee to overlapping duties on the same date.
- Each generated duty row starttime-endtime must fall within both the requirement window and that employee shift starttime-endtime.
Maintenance requirements:
${JSON.stringify(maintenance)}
Meeting room bookings with shared service requirements:
${JSON.stringify(meetingRequirements)}
Personnel shifts:
${JSON.stringify(shifts)}
Fallback roster for guidance:
${JSON.stringify(roster)}`;
      try {
        if (/ollama/i.test(provider)) {
          const config = await getOllamaConfig(colid, req.body.ollamaConfigId);
          if (!config) throw new Error("Active Ollama configuration is missing");
          aiResponse = await callOllama(config, prompt);
        } else {
          const config = await getGeminiConfig(colid);
          if (!config?.apikey) throw new Error("Active Gemini configuration is missing");
          aiResponse = await callGemini(config.apikey, prompt, req.body.geminiModel);
        }
        const aiRows = parseAiRoster(aiResponse);
        if (aiRows.length) roster = normalizeRosterByRequirements(aiRows, dates, requirements, shifts, existingRoster);
      } catch (error) {
        aiResponse = `AI generation failed, deterministic roster used. ${error.message}`;
      }
    }

    const payload = roster.map((row) => buildPayload(configs.rosters, {
      ...row,
      colid,
      user: req.body.user,
      name: req.body.name,
      source: provider && provider !== "Manual" ? provider : row.source || "Auto"
    })).filter((row) => !validatePayload(configs.rosters, row));
    const inserted = payload.length ? await EstateDailyRoster.insertMany(payload, { ordered: false }) : [];
    res.json({ success: true, inserted: inserted.length, data: inserted, aiResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.dailyRosterReport = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = buildQuery(configs.rosters, req.query);
    query.colid = colid;
    const data = await EstateDailyRoster.find(query).sort({ rosterdate: 1, servicetype: 1, estatename: 1, starttime: 1 }).lean();
    const institution = await Institution.findOne({ colid }).sort({ _id: -1 }).lean();
    const summary = {
      totalduties: data.length,
      totalhours: data.reduce((sum, row) => sum + num(row.hours), 0),
      personnel: new Set(data.map((row) => row.employeeemail).filter(Boolean)).size,
      estates: new Set(data.map((row) => row.estateid || row.estatename).filter(Boolean)).size,
      services: new Set(data.map((row) => row.servicetype).filter(Boolean)).size
    };
    res.json({ success: true, data, institution, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAllocateUsers = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const provider = await EstateServiceProvider.findOne({ _id: req.body.providerid, colid }).lean();
    if (!provider) return res.status(404).json({ success: false, message: "Provider not found" });
    const emails = asArray(req.body.employeeemails);
    if (!emails.length) return res.status(400).json({ success: false, message: "Select at least one user" });
    const users = await User.find({ colid, email: { $in: emails }, role: { $not: /^student$/i } }).lean();
    const payload = users.map((person) => ({
      colid,
      user: text(req.body.user),
      name: text(req.body.name),
      providerid: String(provider._id),
      providername: provider.providername,
      servicetype: provider.servicetype,
      employeename: person.name,
      employeeemail: person.email,
      employeephone: person.phone,
      department: person.department,
      role: person.role,
      status: "Active"
    }));
    const inserted = await EstateServiceAllocation.insertMany(payload, { ordered: false });
    res.json({ success: true, inserted: inserted.length, data: inserted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
