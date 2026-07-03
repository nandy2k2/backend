const BusPassTemplate = require("../Models/transportbuspasstemplateds");
const BusPass = require("../Models/transportbuspassds");
const User = require("../Models/user");
const Route = require("../Models/routeds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cleanKey = (value) => text(value).replace(/[^a-zA-Z0-9_.-]/g, "");
const optionFields = ["academicyear", "admissionyear", "program", "programcode", "regulation", "semester", "section", "Major", "Minor", "IDC", "category", "gender", "name", "email", "phone", "regno"];

const shell = (accent, body, extra = "") => `
<div style="width:760px;min-height:430px;border-radius:24px;overflow:hidden;border:1px solid #d7dde8;background:#fff;font-family:Arial,sans-serif;box-shadow:0 18px 48px rgba(15,23,42,.18);position:relative;">
  <div style="height:96px;background:${accent};color:#fff;display:flex;align-items:center;gap:16px;padding:16px 24px;">
    <img src="{{logo}}" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:12px;padding:5px;" />
    <div>
      <div style="font-size:24px;font-weight:900;line-height:1.1;">{{institution}}</div>
      <div style="font-size:13px;opacity:.9;">Bus Pass</div>
    </div>
  </div>
  ${body}
  ${extra}
  <div style="position:absolute;left:24px;right:24px;bottom:14px;font-size:11px;color:#64748b;text-align:center;">{{institutionaddress}}</div>
</div>`;

const defaultTemplates = [
  ["Classic Blue", "#1d4ed8", `<div style="display:grid;grid-template-columns:170px 1fr;gap:24px;padding:26px;"><img src="{{photo}}" style="width:155px;height:185px;object-fit:cover;border-radius:16px;border:5px solid #bfdbfe;" /><div><h2 style="margin:0;color:#0f172a;font-size:28px;">{{name}}</h2><div style="color:#1d4ed8;font-weight:900;margin:6px 0 18px;">{{regno}}</div><table style="width:100%;font-size:15px;line-height:2.1;"><tr><td><b>Route</b></td><td>{{route}}</td></tr><tr><td><b>Semester</b></td><td>{{semester}}</td></tr><tr><td><b>Section</b></td><td>{{section}}</td></tr><tr><td><b>Valid</b></td><td>{{startdate}} to {{enddate}}</td></tr></table></div></div>`],
  ["Crimson Card", "#b91c1c", `<div style="padding:24px;background:#fff7f7;"><div style="display:flex;gap:22px;align-items:center;"><img src="{{photo}}" style="width:150px;height:150px;object-fit:cover;border-radius:50%;border:6px solid #fecaca;" /><div><div style="font-size:12px;font-weight:900;letter-spacing:2px;color:#b91c1c;">STUDENT TRANSPORT PASS</div><h2 style="margin:8px 0 4px;font-size:30px;color:#7f1d1d;">{{name}}</h2><div style="font-weight:900;">{{regno}}</div></div></div><div style="margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:15px;"><div><b>Route</b><br/>{{route}}</div><div><b>Semester / Section</b><br/>{{semester}} / {{section}}</div><div><b>Start Date</b><br/>{{startdate}}</div><div><b>End Date</b><br/>{{enddate}}</div></div></div>`],
  ["Emerald Strip", "#047857", `<div style="padding:26px;"><div style="display:grid;grid-template-columns:1fr 155px;gap:22px;"><div><h2 style="font-size:30px;margin:0;color:#064e3b;">{{name}}</h2><div style="font-size:18px;font-weight:800;color:#047857;margin:8px 0;">{{regno}}</div><div style="background:#ecfdf5;border-radius:16px;padding:16px;font-size:15px;line-height:2;">Route: <b>{{route}}</b><br/>Semester: <b>{{semester}}</b><br/>Section: <b>{{section}}</b><br/>Valid: <b>{{startdate}} - {{enddate}}</b></div></div><img src="{{photo}}" style="width:150px;height:185px;object-fit:cover;border-radius:12px;" /></div></div>`],
  ["Slate Official", "#0f172a", `<div style="padding:22px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2 style="font-size:28px;margin:0;">{{name}}</h2><div style="color:#475569;font-weight:900;margin-top:6px;">Registration: {{regno}}</div></div><img src="{{photo}}" style="width:130px;height:160px;object-fit:cover;border:1px solid #94a3b8;border-radius:8px;" /></div><table style="width:100%;margin-top:22px;border-collapse:collapse;font-size:14px;"><tr><td style="padding:9px;background:#f1f5f9;"><b>Route</b></td><td style="padding:9px;">{{route}}</td><td style="padding:9px;background:#f1f5f9;"><b>Semester</b></td><td style="padding:9px;">{{semester}}</td></tr><tr><td style="padding:9px;background:#f1f5f9;"><b>Section</b></td><td style="padding:9px;">{{section}}</td><td style="padding:9px;background:#f1f5f9;"><b>Validity</b></td><td style="padding:9px;">{{startdate}} to {{enddate}}</td></tr></table></div>`],
  ["Purple Pass", "linear-gradient(135deg,#6d28d9,#a21caf)", `<div style="padding:26px;text-align:center;"><img src="{{photo}}" style="width:145px;height:145px;object-fit:cover;border-radius:24px;border:5px solid #ede9fe;" /><h2 style="margin:14px 0 4px;font-size:29px;color:#581c87;">{{name}}</h2><div style="font-weight:900;color:#7e22ce;">{{regno}}</div><div style="margin:18px auto;max-width:520px;background:#faf5ff;border-radius:16px;padding:15px;font-size:15px;line-height:2;">{{route}} | Semester {{semester}} | Section {{section}}<br/>Valid from {{startdate}} to {{enddate}}</div></div>`],
  ["Gold Route", "#ca8a04", `<div style="padding:26px;background:#fffbeb;"><div style="display:grid;grid-template-columns:165px 1fr;gap:22px;"><img src="{{photo}}" style="width:155px;height:185px;object-fit:cover;border-radius:12px;border:5px solid #facc15;" /><div><div style="font-size:12px;font-weight:900;letter-spacing:2px;color:#a16207;">BUS PASS</div><h2 style="font-size:30px;margin:8px 0;color:#713f12;">{{name}}</h2><p style="font-size:16px;line-height:2;margin:0;">Reg No: <b>{{regno}}</b><br/>Route: <b>{{route}}</b><br/>Semester: <b>{{semester}}</b> Section: <b>{{section}}</b><br/>Validity: <b>{{startdate}} - {{enddate}}</b></p></div></div></div>`],
  ["Teal Compact", "#0f766e", `<div style="padding:22px;"><div style="display:flex;gap:18px;align-items:center;"><img src="{{photo}}" style="width:140px;height:170px;object-fit:cover;border-radius:14px;" /><div><h2 style="font-size:29px;margin:0;color:#134e4a;">{{name}}</h2><div style="font-size:17px;font-weight:900;color:#0f766e;">{{regno}}</div><div style="margin-top:15px;padding:13px;border-radius:14px;background:#ecfeff;font-size:15px;line-height:2;">Route: {{route}}<br/>Semester: {{semester}} | Section: {{section}}<br/>{{startdate}} to {{enddate}}</div></div></div></div>`],
  ["Orange Journey", "#ea580c", `<div style="padding:24px;"><div style="display:grid;grid-template-columns:1fr 150px;gap:24px;"><div><span style="background:#ffedd5;color:#c2410c;border-radius:999px;padding:7px 14px;font-weight:900;">TRANSPORT PASS</span><h2 style="font-size:31px;margin:18px 0 4px;color:#7c2d12;">{{name}}</h2><div style="font-weight:900;">{{regno}}</div><div style="font-size:15px;line-height:2;margin-top:18px;">Route: <b>{{route}}</b><br/>Semester: <b>{{semester}}</b><br/>Section: <b>{{section}}</b><br/>Valid: <b>{{startdate}} - {{enddate}}</b></div></div><img src="{{photo}}" style="width:145px;height:180px;object-fit:cover;border-radius:20px;" /></div></div>`],
  ["Navy Landscape", "#1e3a8a", `<div style="padding:24px;"><div style="display:flex;gap:24px;"><img src="{{photo}}" style="width:180px;height:135px;object-fit:cover;border-radius:14px;border:4px solid #bfdbfe;" /><div><h2 style="font-size:30px;margin:0;color:#1e3a8a;">{{name}}</h2><div style="font-weight:900;margin:7px 0;">{{regno}}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:15px;margin-top:12px;"><div><b>Route</b><br/>{{route}}</div><div><b>Semester</b><br/>{{semester}}</div><div><b>Section</b><br/>{{section}}</div><div><b>Valid</b><br/>{{startdate}} - {{enddate}}</div></div></div></div></div>`],
  ["Clean White", "#334155", `<div style="padding:28px;text-align:center;"><img src="{{photo}}" style="width:140px;height:170px;object-fit:cover;border-radius:8px;border:1px solid #94a3b8;" /><h2 style="font-size:30px;margin:14px 0 4px;color:#111827;">{{name}}</h2><div style="font-weight:900;color:#334155;">{{regno}}</div><hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;" /><div style="font-size:15px;line-height:2;text-align:left;max-width:520px;margin:auto;">Route: {{route}}<br/>Semester: {{semester}}<br/>Section: {{section}}<br/>Validity: {{startdate}} to {{enddate}}</div></div>`]
];

const seedDefaults = async (colid, user = "") => {
  const count = await BusPassTemplate.countDocuments({ colid, isdefault: "Yes" });
  if (count >= 10) return;
  const docs = defaultTemplates.map(([templatename, accent, body], index) => ({
    colid,
    templatename,
    description: `Default bus pass template ${index + 1}`,
    html: shell(accent, body),
    orientation: "Landscape",
    isdefault: "Yes",
    status: "Active",
    user
  }));
  await BusPassTemplate.insertMany(docs);
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const renderTemplate = (html, data) => String(html || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
  const value = data[key];
  if (value === undefined || value === null) return "";
  return value instanceof Date ? formatDate(value) : String(value);
});

const studentQuery = (colid, filters = []) => {
  const query = { colid, role: /^Student$/i };
  (filters || []).forEach((filter) => {
    const field = cleanKey(filter.field);
    const value = text(filter.value);
    if (!field || !value) return;
    if (["name", "email", "phone", "regno"].includes(field)) query[field] = { $regex: escapeRegex(value), $options: "i" };
    else query[field] = value;
  });
  return query;
};

const templatePayload = (body = {}) => ({
  templatename: text(body.templatename),
  description: text(body.description),
  html: String(body.html || ""),
  orientation: text(body.orientation || "Landscape"),
  isdefault: text(body.isdefault || "No"),
  status: text(body.status || "Active"),
  user: text(body.user)
});

exports.getTemplates = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    await seedDefaults(colid, text(req.query.user));
    const data = await BusPassTemplate.find({ colid }).sort({ isdefault: -1, templatename: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveTemplate = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const payload = templatePayload(req.body);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.templatename || !payload.html) return res.status(400).json({ success: false, message: "Template name and HTML are required" });
    const data = req.body.id || req.body._id
      ? await BusPassTemplate.findOneAndUpdate({ _id: req.body.id || req.body._id, colid }, payload, { new: true })
      : await BusPassTemplate.create({ ...payload, colid });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const data = await BusPassTemplate.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid), isdefault: { $ne: "Yes" } });
    if (!data) return res.status(400).json({ success: false, message: "Only custom templates can be deleted" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const options = {};
    await Promise.all(optionFields.map(async (field) => {
      const values = await User.distinct(field, { colid, role: /^Student$/i });
      options[field] = values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, fields: optionFields, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await User.find(studentQuery(colid, req.body.filters)).select("-__v").sort({ name: 1 }).limit(200).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRoutes = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const data = await Route.find({ colid }).sort({ routename: 1, routecode: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPasses = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const query = { colid };
    ["regno", "student", "routecode", "routename", "status"].forEach((field) => {
      if (text(req.query[field])) query[field] = { $regex: escapeRegex(req.query[field]), $options: "i" };
    });
    const data = await BusPass.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generatePass = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const [student, route, template, institution] = await Promise.all([
      User.findOne({ _id: req.body.studentid, colid }).lean(),
      Route.findOne({ _id: req.body.routeid, colid }).lean(),
      BusPassTemplate.findOne({ _id: req.body.templateid, colid }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!route) return res.status(404).json({ success: false, message: "Route not found" });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    if (!req.body.startdate || !req.body.enddate) return res.status(400).json({ success: false, message: "Start date and end date are required" });

    const routeLabel = [route.routecode, route.routename].filter(Boolean).join(" - ");
    const data = {
      ...student,
      name: student.name || "",
      student: student.name || "",
      regno: student.regno || "",
      photo: student.photo || "",
      institution: institution?.institutionname || student.institution || "",
      institutionname: institution?.institutionname || student.institution || "",
      logo: institution?.logolink || "",
      institutionaddress: institution?.address || "",
      route: routeLabel,
      routename: route.routename || "",
      routecode: route.routecode || "",
      pickuppoints: Array.isArray(route.pickuppoints) ? route.pickuppoints.join(", ") : "",
      droppoint: route.droppoint || "",
      semester: student.semester || "",
      section: student.section || "",
      startdate: formatDate(req.body.startdate),
      enddate: formatDate(req.body.enddate)
    };
    const html = renderTemplate(template.html, data);
    const pass = await BusPass.create({
      colid,
      studentid: String(student._id),
      student: student.name || "",
      email: student.email || "",
      phone: student.phone || "",
      regno: student.regno || "",
      photo: student.photo || "",
      institution: data.institution,
      routeid: String(route._id),
      routename: route.routename || "",
      routecode: route.routecode || "",
      semester: student.semester || "",
      section: student.section || "",
      startdate: new Date(req.body.startdate),
      enddate: new Date(req.body.enddate),
      templateid: String(template._id),
      templatename: template.templatename,
      html,
      status: "Active",
      user: text(req.body.user)
    });
    res.json({ success: true, data: pass, html });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePass = async (req, res) => {
  try {
    const data = await BusPass.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Bus pass not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
