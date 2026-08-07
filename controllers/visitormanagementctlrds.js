const VisitorPass = require("../Models/visitormanagementds");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (rows) => [...new Set((rows || []).map(text).filter(Boolean))].sort();
const asDate = (value) => value ? new Date(value) : null;

const base = (req) => ({
  colid: num(req.body.colid || req.query.colid),
  name: text(req.body.name || req.body.username || req.query.name),
  user: text(req.body.user || req.query.user)
});

const queryFrom = (input = {}) => {
  const query = { colid: num(input.colid) };
  ["gatepassno", "visitorname", "visitoremail", "visitorphone", "organization", "purpose", "department", "whomtomeet", "whomtomeetemail", "approvalstatus", "passstatus", "gatepassgenerated", "finalmeetingstatus", "gate", "vehicletype", "vehicleno", "status"].forEach((field) => {
    if (text(input[field])) query[field] = { $regex: esc(input[field]), $options: "i" };
  });
  if (input.fromdate || input.todate) {
    query.visitdate = {};
    if (input.fromdate) query.visitdate.$gte = new Date(`${input.fromdate}T00:00:00`);
    if (input.todate) query.visitdate.$lte = new Date(`${input.todate}T23:59:59`);
  }
  if (Array.isArray(input.dynamicFilters)) {
    input.dynamicFilters.forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || field.includes("$") || !value) return;
      if (field === "visitdate") {
        query.visitdate = query.visitdate || {};
        query.visitdate.$gte = new Date(`${value}T00:00:00`);
        query.visitdate.$lte = new Date(`${value}T23:59:59`);
      } else if (text(filter.operator).toLowerCase() === "equals") {
        query[field] = value;
      } else {
        query[field] = { $regex: esc(value), $options: "i" };
      }
    });
  }
  return query;
};

const payload = (body = {}) => {
  const visitdate = asDate(body.visitdate) || new Date();
  return {
    colid: num(body.colid),
    visitdate,
    gatepassno: text(body.gatepassno) || `VGP-${num(body.colid)}-${Date.now()}`,
    visitorname: text(body.visitorname),
    visitoremail: text(body.visitoremail),
    visitorphone: text(body.visitorphone),
    organization: text(body.organization),
    visitoridtype: text(body.visitoridtype),
    visitoridno: text(body.visitoridno),
    purpose: text(body.purpose),
    department: text(body.department),
    whomtomeet: text(body.whomtomeet),
    whomtomeetemail: text(body.whomtomeetemail),
    approvalstatus: text(body.approvalstatus || "Pending"),
    approvedby: text(body.approvedby),
    approvedbyemail: text(body.approvedbyemail),
    approvedat: asDate(body.approvedat),
    approvalremarks: text(body.approvalremarks),
    gate: text(body.gate),
    passstatus: text(body.passstatus || "Requested"),
    issuedby: text(body.issuedby),
    issuedbyemail: text(body.issuedbyemail),
    issuedat: asDate(body.issuedat),
    gatepassgenerated: text(body.gatepassgenerated || "No"),
    gatepassgeneratedby: text(body.gatepassgeneratedby),
    gatepassgeneratedbyemail: text(body.gatepassgeneratedbyemail),
    gatepassgeneratedat: asDate(body.gatepassgeneratedat),
    intime: asDate(body.intime),
    outtime: asDate(body.outtime),
    checkoutremarks: text(body.checkoutremarks),
    finalmeetingstatus: text(body.finalmeetingstatus || "Pending"),
    meetingdetails: text(body.meetingdetails),
    meetingoutcome: text(body.meetingoutcome),
    meetingupdatedby: text(body.meetingupdatedby),
    meetingupdatedbyemail: text(body.meetingupdatedbyemail),
    meetingupdatedat: asDate(body.meetingupdatedat),
    vehicletype: text(body.vehicletype),
    vehicleno: text(body.vehicleno).toUpperCase(),
    drivername: text(body.drivername),
    driverphone: text(body.driverphone),
    itemsbrought: text(body.itemsbrought),
    laptopserial: text(body.laptopserial),
    remarks: text(body.remarks),
    status: text(body.status || "Active"),
    name: text(body.name || body.username),
    user: text(body.user)
  };
};

const groupCount = (rows, field) => Object.values(rows.reduce((acc, row) => {
  const label = text(row[field]) || "Not specified";
  acc[label] = acc[label] || { label, count: 0 };
  acc[label].count += 1;
  return acc;
}, {})).sort((a, b) => b.count - a.count);

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [users, departments, gates, purposes, statuses, passStatuses, meetingStatuses, institution] = await Promise.all([
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email department role designation").sort({ name: 1 }).limit(3000).lean(),
      User.distinct("department", { colid, department: { $exists: true, $ne: "" } }),
      VisitorPass.distinct("gate", { colid }),
      VisitorPass.distinct("purpose", { colid }),
      VisitorPass.distinct("approvalstatus", { colid }),
      VisitorPass.distinct("passstatus", { colid }),
      VisitorPass.distinct("finalmeetingstatus", { colid }),
      Institution.findOne({ colid }).sort({ _id: -1 }).lean()
    ]);
    res.json({
      success: true,
      users,
      departments: uniq(departments),
      gates: uniq(gates),
      purposes: uniq([...purposes, "Meeting", "Admission enquiry", "Vendor", "Interview", "Delivery", "Maintenance", "Parent visit", "Official work"]),
      approvalstatuses: uniq([...statuses, "Pending", "Approved", "Rejected"]),
      passstatuses: uniq([...passStatuses, "Requested", "Approved", "Issued", "Checked In", "Checked Out", "Rejected"]),
      finalmeetingstatuses: uniq([...meetingStatuses, "Pending", "Updated"]),
      vehicletypes: ["None", "Two Wheeler", "Car", "Van", "Bus", "Truck", "Ambulance", "Other"],
      idtypes: ["Aadhaar", "Passport", "Driving License", "Voter ID", "PAN", "Institution ID", "Other"],
      institution: institution || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const rows = await VisitorPass.find(queryFrom(req.query)).sort({ visitdate: -1, createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.colid || !data.visitorname || !data.visitorphone || !data.whomtomeetemail) {
      return res.status(400).json({ success: false, message: "Visitor name, phone and whom to meet are required" });
    }
    const row = req.body.id
      ? await VisitorPass.findOneAndUpdate({ _id: req.body.id, colid: data.colid }, data, { new: true })
      : await VisitorPass.create(data);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.action = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const row = await VisitorPass.findOne({ _id: req.body.id, colid });
    if (!row) return res.status(404).json({ success: false, message: "Visitor pass not found" });
    const action = text(req.body.action).toLowerCase();
    if (action === "approve" || action === "reject") {
      row.approvalstatus = action === "approve" ? "Approved" : "Rejected";
      row.passstatus = action === "approve" ? "Issued" : "Rejected";
      row.approvedby = text(req.body.name);
      row.approvedbyemail = text(req.body.user);
      row.approvedat = new Date();
      row.approvalremarks = text(req.body.remarks || row.approvalremarks);
      if (action === "approve" && !row.issuedat) {
        row.passstatus = "Approved";
      }
    } else if (action === "generatepass") {
      if (row.approvalstatus !== "Approved") return res.status(400).json({ success: false, message: "Approve visitor before generating gate pass" });
      row.passstatus = "Issued";
      row.gatepassgenerated = "Yes";
      row.gatepassgeneratedby = text(req.body.name);
      row.gatepassgeneratedbyemail = text(req.body.user);
      row.gatepassgeneratedat = new Date();
      row.issuedat = new Date();
      row.issuedby = text(req.body.name);
      row.issuedbyemail = text(req.body.user);
    } else if (action === "checkin") {
      row.passstatus = "Checked In";
      row.intime = new Date();
    } else if (action === "checkout") {
      row.passstatus = "Checked Out";
      row.outtime = new Date();
      row.checkoutremarks = text(req.body.remarks || row.checkoutremarks);
    } else if (action === "meetingupdate") {
      row.finalmeetingstatus = "Updated";
      row.meetingdetails = text(req.body.meetingdetails || req.body.remarks || row.meetingdetails);
      row.meetingoutcome = text(req.body.meetingoutcome || row.meetingoutcome);
      row.meetingupdatedby = text(req.body.name);
      row.meetingupdatedbyemail = text(req.body.user);
      row.meetingupdatedat = new Date();
    }
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMany = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const result = await VisitorPass.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const meta = base(req);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows found for bulk upload" });
    const docs = items.map((item) => payload({ ...item, ...meta, colid: meta.colid }));
    const inserted = await VisitorPass.insertMany(docs, { ordered: false });
    res.json({ success: true, inserted: inserted.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const rows = await VisitorPass.find(queryFrom(req.body)).sort({ visitdate: -1 }).limit(5000).lean();
    const total = rows.length;
    const checkedIn = rows.filter((row) => row.passstatus === "Checked In").length;
    const checkedOut = rows.filter((row) => row.passstatus === "Checked Out").length;
    const pending = rows.filter((row) => row.approvalstatus === "Pending").length;
    const approved = rows.filter((row) => row.approvalstatus === "Approved").length;
    const meetingPending = rows.filter((row) => (row.finalmeetingstatus || "Pending") === "Pending").length;
    const meetingUpdated = rows.filter((row) => row.finalmeetingstatus === "Updated").length;
    const gatepassGenerated = rows.filter((row) => row.gatepassgenerated === "Yes").length;
    const institution = await Institution.findOne({ colid: num(req.body.colid) }).sort({ _id: -1 }).lean();
    res.json({
      success: true,
      data: rows,
      institution: institution || {},
      summary: {
        total,
        checkedIn,
        checkedOut,
        pending,
        approved,
        meetingPending,
        meetingUpdated,
        gatepassGenerated,
        byPurpose: groupCount(rows, "purpose"),
        byDepartment: groupCount(rows, "department"),
        byApproval: groupCount(rows, "approvalstatus"),
        byPassStatus: groupCount(rows, "passstatus"),
        byMeetingStatus: groupCount(rows, "finalmeetingstatus"),
        byHost: groupCount(rows, "whomtomeet"),
        byVehicleType: groupCount(rows, "vehicletype"),
        byDate: groupCount(rows.map((row) => ({ ...row, datekey: row.visitdate ? new Date(row.visitdate).toISOString().slice(0, 10) : "" })), "datekey")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
