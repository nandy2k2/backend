const nodemailer = require("nodemailer");
const RoomResource = require("../Models/roomresourceds");
const RoomTimeOwner = require("../Models/roomtimeownerds");
const ResourceType = require("../Models/resourcetypeds");
const Resource = require("../Models/resourcemanagementds");
const ResourceBooking = require("../Models/resourcebookingds");
const User = require("../Models/user");
const EmailConfiguration = require("../Models/emailconfigurationds");
const { EstateCampus, EstateRealEstate } = require("../Models/estatemanagementds");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const yes = (value) => /^yes|true|1$/i.test(text(value));
const floorValuesFromEstate = (item = {}) => {
  const values = [item.floor, item.floorno, item.floorname, item.floors].filter(Boolean);
  const count = Number(item.nooffloors || item.numberoffloors || item.totalfloors || 0);
  if (count > 0 && count < 200) {
    for (let index = 1; index <= count; index += 1) values.push(String(index));
  }
  return values;
};

const ownerOptions = async (colid) => {
  const users = await User.find({ colid }).select("name email user role department designation").sort({ name: 1, email: 1 }).lean();
  return users
    .filter((item) => text(item.role).toLowerCase() !== "student")
    .map((item) => ({
      name: item.name || item.email || item.user || "",
      email: item.email || item.user || "",
      role: item.role || "",
      department: item.department || "",
      designation: item.designation || ""
    }))
    .filter((item) => item.email || item.name);
};

const emailConfigLabel = (item) => [item.provider, item.type, item.username].map(text).filter(Boolean).join(" - ") || item.username || item._id;
const smtpHost = (config) => text(config.smtp || config.smptp || config.host);
const transporterFor = (config) => nodemailer.createTransport({
  host: smtpHost(config),
  port: Number(config.port || 587),
  secure: yes(config.secure) || Number(config.port) === 465,
  auth: { user: config.username, pass: config.password }
});

const maybeSendBookingMail = async ({ colid, booking, emailconfigurationid }) => {
  if (!yes(booking.notifyparticipants)) return { sent: 0, skipped: "Notify not selected" };
  const recipients = (booking.participants || []).map((item) => item.email).filter(Boolean);
  if (!recipients.length) return { sent: 0, skipped: "No participant emails" };
  const config = await EmailConfiguration.findOne({ _id: emailconfigurationid, colid }).lean();
  if (!config?.username || !config?.password || !smtpHost(config)) return { sent: 0, skipped: "Selected email configuration is incomplete" };
  await transporterFor(config).sendMail({
    from: `"Resource Booking" <${config.username}>`,
    to: recipients.join(","),
    subject: `Resource booking: ${booking.title}`,
    html: `<p>Dear participant,</p><p>You have been added to a resource booking.</p>
      <p><b>Resource:</b> ${booking.resourcename || booking.resourceid}<br/>
      <b>Type:</b> ${booking.resourcetype}<br/>
      <b>Start:</b> ${booking.starttime}<br/>
      <b>End:</b> ${booking.endtime}</p>
      <p>${booking.description || ""}</p>`,
    text: `Resource booking: ${booking.title}\nResource: ${booking.resourcename || booking.resourceid}\nStart: ${booking.starttime}\nEnd: ${booking.endtime}\n${booking.description || ""}`
  });
  return { sent: recipients.length };
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [owners, resourceTypes, resources, rooms, emailConfigurations, estateCampuses, estateBuildings] = await Promise.all([
      ownerOptions(colid),
      ResourceType.find({ colid }).sort({ resourcetype: 1 }).lean(),
      Resource.find({ colid }).sort({ resourcetype: 1, resourcename: 1 }).lean(),
      RoomResource.find({ colid }).sort({ campus: 1, building: 1, floor: 1, roomno: 1 }).lean(),
      EmailConfiguration.find({ colid, isactive: { $not: /^no$/i } }).sort({ default: -1, provider: 1, username: 1 }).lean(),
      EstateCampus.find({ colid, status: { $not: /^inactive$/i } }).sort({ campus: 1, location: 1 }).lean(),
      EstateRealEstate.find({ colid, status: { $not: /^inactive$/i } }).sort({ location: 1, estatename: 1 }).lean()
    ]);
    const buildingOptions = estateBuildings.filter((item) => {
      const estateType = text(item.estatetype || item.type || item.typename);
      return !estateType || /building/i.test(estateType);
    });
    res.json({
      success: true,
      owners,
      resourceTypes,
      resources,
      rooms,
      estateCampuses,
      estateBuildings: buildingOptions,
      emailConfigurations: emailConfigurations.map((item) => ({ ...item, label: emailConfigLabel(item) })),
      campuses: uniq([...estateCampuses.map((item) => item.campus), ...resources.map((item) => item.campus), ...rooms.map((item) => item.campus)]),
      buildings: uniq([...buildingOptions.map((item) => item.estatename), ...resources.map((item) => item.building), ...rooms.map((item) => item.building)]),
      floors: uniq([...buildingOptions.flatMap(floorValuesFromEstate), ...resources.map((item) => item.floor), ...rooms.map((item) => item.floor)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.roomTimeOwners = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    if (req.query.roomid) query.roomid = req.query.roomid;
    const data = await RoomTimeOwner.find(query).sort({ campus: 1, building: 1, floor: 1, roomno: 1, fromtime: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRoomTimeOwner = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const item = {
      roomid: text(req.body.roomid),
      roomno: text(req.body.roomno),
      campus: text(req.body.campus),
      building: text(req.body.building),
      floor: text(req.body.floor),
      owner: text(req.body.owner),
      owneremail: text(req.body.owneremail),
      fromtime: text(req.body.fromtime),
      totime: text(req.body.totime),
      colid,
      user: text(req.body.user)
    };
    if (!item.roomid) return res.status(400).json({ success: false, message: "Room is required" });
    if (!item.owneremail) return res.status(400).json({ success: false, message: "Owner is required" });
    if (!item.fromtime || !item.totime) return res.status(400).json({ success: false, message: "From time and to time are required" });
    const data = req.body.id
      ? await RoomTimeOwner.findOneAndUpdate({ _id: req.body.id, colid }, item, { new: true, runValidators: true })
      : await RoomTimeOwner.create(item);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRoomTimeOwner = async (req, res) => {
  try {
    const data = await RoomTimeOwner.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Timewise owner not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listResourceTypes = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ResourceType.find({ colid }).sort({ resourcetype: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveResourceType = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const item = { resourcetype: text(req.body.resourcetype), description: text(req.body.description), colid, user: text(req.body.user) };
    if (colid === undefined || !item.resourcetype) return res.status(400).json({ success: false, message: "colid and resource type are required" });
    const data = req.body.id
      ? await ResourceType.findOneAndUpdate({ _id: req.body.id, colid }, item, { new: true, runValidators: true })
      : await ResourceType.create(item);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteResourceType = async (req, res) => {
  try {
    await ResourceType.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resourcePayload = (body = {}) => ({
  resourcetypeid: text(body.resourcetypeid),
  resourcetype: text(body.resourcetype),
  resourcename: text(body.resourcename),
  resourceid: text(body.resourceid),
  campus: text(body.campus),
  building: text(body.building),
  floor: text(body.floor),
  introductiondate: text(body.introductiondate),
  retirementdate: text(body.retirementdate),
  owner: text(body.owner),
  owneremail: text(body.owneremail),
  colid: toNumber(body.colid),
  user: text(body.user)
});

exports.listResources = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["resourcetype", "resourcetypeid", "resourceid", "campus", "building", "floor", "owneremail"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    if (req.query.search) {
      const re = new RegExp(escapeRegex(req.query.search), "i");
      query.$or = [{ resourcename: re }, { resourceid: re }, { owner: re }, { owneremail: re }];
    }
    const data = await Resource.find(query).sort({ resourcetype: 1, resourcename: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveResource = async (req, res) => {
  try {
    const item = resourcePayload(req.body);
    if (item.colid === undefined || !item.resourcetype || !item.resourcename || !item.resourceid) {
      return res.status(400).json({ success: false, message: "Resource type, resource name and resource id are required" });
    }
    const data = req.body.id
      ? await Resource.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await Resource.create(item);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteResource = async (req, res) => {
  try {
    await Resource.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listBookings = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["resourceobjectid", "resourceid", "resourcetype", "resourcetypeid"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    if (req.query.from || req.query.to) {
      query.starttime = {};
      if (req.query.from) query.starttime.$gte = new Date(req.query.from);
      if (req.query.to) query.starttime.$lte = new Date(req.query.to);
    }
    const data = await ResourceBooking.find(query).sort({ starttime: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveBooking = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const starttime = new Date(req.body.starttime);
    const endtime = new Date(req.body.endtime);
    if (colid === undefined || !req.body.resourceobjectid || !req.body.title || Number.isNaN(starttime.getTime()) || Number.isNaN(endtime.getTime())) {
      return res.status(400).json({ success: false, message: "Resource, title, start time and end time are required" });
    }
    if (endtime <= starttime) return res.status(400).json({ success: false, message: "End time must be after start time" });
    const resource = await Resource.findOne({ _id: req.body.resourceobjectid, colid }).lean();
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    const overlapQuery = {
      colid,
      resourceobjectid: text(req.body.resourceobjectid),
      starttime: { $lt: endtime },
      endtime: { $gt: starttime }
    };
    if (req.body.id) overlapQuery._id = { $ne: req.body.id };
    const overlap = await ResourceBooking.findOne(overlapQuery).lean();
    if (overlap) return res.status(409).json({ success: false, message: "This resource is already booked for part or all of the selected slot" });
    const emailConfig = req.body.emailconfigurationid ? await EmailConfiguration.findOne({ _id: req.body.emailconfigurationid, colid }).lean() : null;
    const item = {
      resourcetypeid: resource.resourcetypeid || text(req.body.resourcetypeid),
      resourcetype: resource.resourcetype,
      resourceobjectid: text(req.body.resourceobjectid),
      resourceid: resource.resourceid,
      resourcename: resource.resourcename,
      campus: resource.campus,
      building: resource.building,
      floor: resource.floor,
      starttime,
      endtime,
      title: text(req.body.title),
      description: text(req.body.description),
      participants: Array.isArray(req.body.participants) ? req.body.participants.map((item) => ({ name: text(item.name), email: text(item.email), type: text(item.type) || "Internal" })).filter((item) => item.email || item.name) : [],
      emailconfigurationid: text(req.body.emailconfigurationid),
      emailconfiguration: emailConfig ? emailConfigLabel(emailConfig) : text(req.body.emailconfiguration),
      notifyparticipants: yes(req.body.notifyparticipants) ? "Yes" : "No",
      colid,
      user: text(req.body.user),
      namecreated: text(req.body.namecreated)
    };
    const data = req.body.id
      ? await ResourceBooking.findOneAndUpdate({ _id: req.body.id, colid }, item, { new: true, runValidators: true })
      : await ResourceBooking.create(item);
    const mail = await maybeSendBookingMail({ colid, booking: data.toObject ? data.toObject() : data, emailconfigurationid: item.emailconfigurationid });
    res.json({ success: true, data, mail });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBooking = async (req, res) => {
  try {
    await ResourceBooking.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["resourceobjectid", "resourceid", "resourcetype", "resourcetypeid"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    if (req.query.from || req.query.to) {
      query.starttime = {};
      if (req.query.from) query.starttime.$gte = new Date(req.query.from);
      if (req.query.to) query.starttime.$lte = new Date(req.query.to);
    }
    const bookings = await ResourceBooking.find(query).sort({ starttime: 1 }).lean();
    const byType = {};
    const byResource = {};
    const byMonth = {};
    bookings.forEach((row) => {
      const type = row.resourcetype || "Unknown";
      const resource = row.resourcename || row.resourceid || "Unknown";
      const month = row.starttime ? new Date(row.starttime).toISOString().slice(0, 7) : "Unknown";
      byType[type] = (byType[type] || 0) + 1;
      byResource[resource] = (byResource[resource] || 0) + 1;
      byMonth[month] = (byMonth[month] || 0) + 1;
    });
    const toChart = (obj) => Object.entries(obj).map(([name, count]) => ({ name, count }));
    res.json({
      success: true,
      bookings,
      summary: {
        totalBookings: bookings.length,
        resourcesUsed: Object.keys(byResource).length,
        typesUsed: Object.keys(byType).length,
        participants: bookings.reduce((sum, row) => sum + (row.participants || []).length, 0)
      },
      charts: { byType: toChart(byType), byResource: toChart(byResource), byMonth: toChart(byMonth) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
