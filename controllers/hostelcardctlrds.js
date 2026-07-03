const HostelCardTemplate = require("../Models/hostelcardtemplateds");
const HostelCard = require("../Models/hostelcardds");
const HostelAssignment = require("../Models/hostelbedassignmentmapds");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cleanKey = (value) => text(value).replace(/[^a-zA-Z0-9_.-]/g, "");
const optionFields = ["buildingname", "hosteltype", "guesttype", "block", "floor", "roomno", "roomtype", "bedno", "student", "studentemail", "studentphone", "program", "programcode", "regno", "status"];

const shell = (accent, body) => `
<div style="width:760px;min-height:430px;border-radius:24px;overflow:hidden;border:1px solid #d7dde8;background:#fff;font-family:Arial,sans-serif;box-shadow:0 18px 48px rgba(15,23,42,.18);position:relative;">
  <div style="height:96px;background:${accent};color:#fff;display:flex;align-items:center;gap:16px;padding:16px 24px;">
    <img src="{{logo}}" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:12px;padding:5px;" />
    <div>
      <div style="font-size:24px;font-weight:900;line-height:1.1;">{{institution}}</div>
      <div style="font-size:13px;opacity:.9;">Hostel Card</div>
    </div>
  </div>
  ${body}
  <div style="position:absolute;left:24px;right:24px;bottom:14px;font-size:11px;color:#64748b;text-align:center;">{{institutionaddress}}</div>
</div>`;

const defaultTemplates = [
  ["Blue Residence", "#1d4ed8", `<div style="display:grid;grid-template-columns:170px 1fr;gap:24px;padding:26px;"><img src="{{photo}}" style="width:155px;height:185px;object-fit:cover;border-radius:16px;border:5px solid #bfdbfe;" /><div><h2 style="margin:0;color:#0f172a;font-size:28px;">{{student}}</h2><div style="color:#1d4ed8;font-weight:900;margin:6px 0 18px;">{{regno}}</div><table style="width:100%;font-size:15px;line-height:2.1;"><tr><td><b>Building</b></td><td>{{buildingname}}</td></tr><tr><td><b>Room</b></td><td>{{roomno}} / Bed {{bedno}}</td></tr><tr><td><b>Block/Floor</b></td><td>{{block}} / {{floor}}</td></tr><tr><td><b>Program</b></td><td>{{programcode}}</td></tr></table></div></div>`],
  ["Crimson Hostel", "#b91c1c", `<div style="padding:24px;background:#fff7f7;"><div style="display:flex;gap:22px;align-items:center;"><img src="{{photo}}" style="width:150px;height:150px;object-fit:cover;border-radius:50%;border:6px solid #fecaca;" /><div><div style="font-size:12px;font-weight:900;letter-spacing:2px;color:#b91c1c;">RESIDENT HOSTEL CARD</div><h2 style="margin:8px 0 4px;font-size:30px;color:#7f1d1d;">{{student}}</h2><div style="font-weight:900;">{{regno}}</div></div></div><div style="margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:15px;"><div><b>Hostel</b><br/>{{buildingname}}</div><div><b>Room</b><br/>{{roomno}}, Bed {{bedno}}</div><div><b>Block</b><br/>{{block}}</div><div><b>Floor</b><br/>{{floor}}</div></div></div>`],
  ["Emerald Stay", "#047857", `<div style="padding:26px;"><div style="display:grid;grid-template-columns:1fr 155px;gap:22px;"><div><h2 style="font-size:30px;margin:0;color:#064e3b;">{{student}}</h2><div style="font-size:18px;font-weight:800;color:#047857;margin:8px 0;">{{regno}}</div><div style="background:#ecfdf5;border-radius:16px;padding:16px;font-size:15px;line-height:2;">Hostel: <b>{{buildingname}}</b><br/>Room: <b>{{roomno}}</b> Bed: <b>{{bedno}}</b><br/>Block/Floor: <b>{{block}} / {{floor}}</b><br/>Resident Type: <b>{{residenttype}}</b></div></div><img src="{{photo}}" style="width:150px;height:185px;object-fit:cover;border-radius:12px;" /></div></div>`],
  ["Slate Official", "#0f172a", `<div style="padding:22px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2 style="font-size:28px;margin:0;">{{student}}</h2><div style="color:#475569;font-weight:900;margin-top:6px;">Registration: {{regno}}</div></div><img src="{{photo}}" style="width:130px;height:160px;object-fit:cover;border:1px solid #94a3b8;border-radius:8px;" /></div><table style="width:100%;margin-top:22px;border-collapse:collapse;font-size:14px;"><tr><td style="padding:9px;background:#f1f5f9;"><b>Building</b></td><td style="padding:9px;">{{buildingname}}</td><td style="padding:9px;background:#f1f5f9;"><b>Room</b></td><td style="padding:9px;">{{roomno}}</td></tr><tr><td style="padding:9px;background:#f1f5f9;"><b>Bed</b></td><td style="padding:9px;">{{bedno}}</td><td style="padding:9px;background:#f1f5f9;"><b>Block/Floor</b></td><td style="padding:9px;">{{block}} / {{floor}}</td></tr></table></div>`],
  ["Purple Residence", "linear-gradient(135deg,#6d28d9,#a21caf)", `<div style="padding:26px;text-align:center;"><img src="{{photo}}" style="width:145px;height:145px;object-fit:cover;border-radius:24px;border:5px solid #ede9fe;" /><h2 style="margin:14px 0 4px;font-size:29px;color:#581c87;">{{student}}</h2><div style="font-weight:900;color:#7e22ce;">{{regno}}</div><div style="margin:18px auto;max-width:520px;background:#faf5ff;border-radius:16px;padding:15px;font-size:15px;line-height:2;">{{buildingname}} | Room {{roomno}} | Bed {{bedno}}<br/>Block {{block}}, Floor {{floor}}</div></div>`],
  ["Gold Resident", "#ca8a04", `<div style="padding:26px;background:#fffbeb;"><div style="display:grid;grid-template-columns:165px 1fr;gap:22px;"><img src="{{photo}}" style="width:155px;height:185px;object-fit:cover;border-radius:12px;border:5px solid #facc15;" /><div><div style="font-size:12px;font-weight:900;letter-spacing:2px;color:#a16207;">HOSTEL CARD</div><h2 style="font-size:30px;margin:8px 0;color:#713f12;">{{student}}</h2><p style="font-size:16px;line-height:2;margin:0;">Reg No: <b>{{regno}}</b><br/>Hostel: <b>{{buildingname}}</b><br/>Room: <b>{{roomno}}</b> Bed: <b>{{bedno}}</b><br/>Program: <b>{{programcode}}</b></p></div></div></div>`],
  ["Teal Compact", "#0f766e", `<div style="padding:22px;"><div style="display:flex;gap:18px;align-items:center;"><img src="{{photo}}" style="width:140px;height:170px;object-fit:cover;border-radius:14px;" /><div><h2 style="font-size:29px;margin:0;color:#134e4a;">{{student}}</h2><div style="font-size:17px;font-weight:900;color:#0f766e;">{{regno}}</div><div style="margin-top:15px;padding:13px;border-radius:14px;background:#ecfeff;font-size:15px;line-height:2;">Hostel: {{buildingname}}<br/>Room {{roomno}}, Bed {{bedno}}<br/>{{block}} Block, Floor {{floor}}</div></div></div></div>`],
  ["Orange Hostel", "#ea580c", `<div style="padding:24px;"><div style="display:grid;grid-template-columns:1fr 150px;gap:24px;"><div><span style="background:#ffedd5;color:#c2410c;border-radius:999px;padding:7px 14px;font-weight:900;">HOSTEL PASS</span><h2 style="font-size:31px;margin:18px 0 4px;color:#7c2d12;">{{student}}</h2><div style="font-weight:900;">{{regno}}</div><div style="font-size:15px;line-height:2;margin-top:18px;">Building: <b>{{buildingname}}</b><br/>Room: <b>{{roomno}}</b><br/>Bed: <b>{{bedno}}</b><br/>Block/Floor: <b>{{block}} / {{floor}}</b></div></div><img src="{{photo}}" style="width:145px;height:180px;object-fit:cover;border-radius:20px;" /></div></div>`],
  ["Navy Landscape", "#1e3a8a", `<div style="padding:24px;"><div style="display:flex;gap:24px;"><img src="{{photo}}" style="width:180px;height:135px;object-fit:cover;border-radius:14px;border:4px solid #bfdbfe;" /><div><h2 style="font-size:30px;margin:0;color:#1e3a8a;">{{student}}</h2><div style="font-weight:900;margin:7px 0;">{{regno}}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:15px;margin-top:12px;"><div><b>Building</b><br/>{{buildingname}}</div><div><b>Room</b><br/>{{roomno}}</div><div><b>Bed</b><br/>{{bedno}}</div><div><b>Block/Floor</b><br/>{{block}} / {{floor}}</div></div></div></div></div>`],
  ["Clean White", "#334155", `<div style="padding:28px;text-align:center;"><img src="{{photo}}" style="width:140px;height:170px;object-fit:cover;border-radius:8px;border:1px solid #94a3b8;" /><h2 style="font-size:30px;margin:14px 0 4px;color:#111827;">{{student}}</h2><div style="font-weight:900;color:#334155;">{{regno}}</div><hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;" /><div style="font-size:15px;line-height:2;text-align:left;max-width:520px;margin:auto;">Hostel: {{buildingname}}<br/>Room: {{roomno}}, Bed {{bedno}}<br/>Block: {{block}}, Floor {{floor}}<br/>Program: {{programcode}}</div></div>`]
];

const seedDefaults = async (colid, user = "") => {
  const count = await HostelCardTemplate.countDocuments({ colid, isdefault: "Yes" });
  if (count >= 10) return;
  await HostelCardTemplate.insertMany(defaultTemplates.map(([templatename, accent, body], index) => ({
    colid,
    templatename,
    description: `Default hostel card template ${index + 1}`,
    html: shell(accent, body),
    orientation: "Landscape",
    isdefault: "Yes",
    status: "Active",
    user
  })));
};

const renderTemplate = (html, data) => String(html || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
  const value = data[key];
  return value === undefined || value === null ? "" : String(value);
});

const assignmentQuery = (colid, filters = []) => {
  const query = { colid };
  (filters || []).forEach((filter) => {
    const field = cleanKey(filter.field);
    const value = text(filter.value);
    if (!field || !value) return;
    if (["student", "studentemail", "studentphone", "regno"].includes(field)) query[field] = { $regex: escapeRegex(value), $options: "i" };
    else query[field] = value;
  });
  return query;
};

exports.getTemplates = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    await seedDefaults(colid, text(req.query.user));
    const data = await HostelCardTemplate.find({ colid }).sort({ isdefault: -1, templatename: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveTemplate = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = {
      templatename: text(req.body.templatename),
      description: text(req.body.description),
      html: String(req.body.html || ""),
      orientation: text(req.body.orientation || "Landscape"),
      isdefault: text(req.body.isdefault || "No"),
      status: text(req.body.status || "Active"),
      user: text(req.body.user)
    };
    if (!payload.templatename || !payload.html) return res.status(400).json({ success: false, message: "Template name and HTML are required" });
    const data = req.body.id || req.body._id
      ? await HostelCardTemplate.findOneAndUpdate({ _id: req.body.id || req.body._id, colid }, payload, { new: true })
      : await HostelCardTemplate.create({ ...payload, colid });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const data = await HostelCardTemplate.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid), isdefault: { $ne: "Yes" } });
    if (!data) return res.status(400).json({ success: false, message: "Only custom templates can be deleted" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAssignmentOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const options = {};
    await Promise.all(optionFields.map(async (field) => {
      const values = await HostelAssignment.distinct(field, { colid });
      options[field] = values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, fields: optionFields, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchAssignments = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await HostelAssignment.find(assignmentQuery(colid, req.body.filters)).sort({ student: 1 }).limit(200).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCards = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const query = { colid };
    ["student", "regno", "buildingname", "roomno", "status"].forEach((field) => {
      if (text(req.query[field])) query[field] = { $regex: escapeRegex(req.query[field]), $options: "i" };
    });
    const data = await HostelCard.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateCard = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const [assignment, template, institution] = await Promise.all([
      HostelAssignment.findOne({ _id: req.body.assignmentid, colid }).lean(),
      HostelCardTemplate.findOne({ _id: req.body.templateid, colid }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    if (!assignment) return res.status(404).json({ success: false, message: "Hostel assignment not found" });
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    const student = assignment.studentid ? await User.findOne({ _id: assignment.studentid, colid }).lean() : null;
    const data = {
      ...assignment,
      ...(student || {}),
      student: assignment.student || student?.name || "",
      name: assignment.student || student?.name || "",
      email: assignment.studentemail || student?.email || "",
      phone: assignment.studentphone || student?.phone || "",
      photo: student?.photo || "",
      institution: institution?.institutionname || "",
      institutionname: institution?.institutionname || "",
      logo: institution?.logolink || "",
      institutionaddress: institution?.address || ""
    };
    const html = renderTemplate(template.html, data);
    const card = await HostelCard.create({
      colid,
      assignmentid: String(assignment._id),
      studentid: String(assignment.studentid || ""),
      student: assignment.student,
      studentemail: assignment.studentemail,
      studentphone: assignment.studentphone,
      regno: assignment.regno,
      photo: student?.photo || "",
      institution: data.institution,
      buildingname: assignment.buildingname,
      hosteltype: assignment.hosteltype,
      guesttype: assignment.guesttype,
      block: assignment.block,
      floor: assignment.floor,
      roomno: assignment.roomno,
      roomtype: assignment.roomtype,
      bedno: assignment.bedno,
      program: assignment.program,
      programcode: assignment.programcode,
      templateid: String(template._id),
      templatename: template.templatename,
      html,
      status: "Active",
      user: text(req.body.user)
    });
    res.json({ success: true, data: card, html });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCard = async (req, res) => {
  try {
    const data = await HostelCard.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Hostel card not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
