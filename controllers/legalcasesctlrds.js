const LegalCase = require("../Models/legalcaseds");
const LegalCaseHearing = require("../Models/legalcasehearingds");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const scoped = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const dateOnly = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const endOfDay = (value) => {
  const date = dateOnly(value);
  if (!date) return undefined;
  date.setHours(23, 59, 59, 999);
  return date;
};
const arrayText = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/[,;|]/).map(text).filter(Boolean);
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  ["startdate", "hearingdate", "nexthearingdate", "createdAt", "updatedAt"].forEach((field) => {
    if (item[field]) item[field] = new Date(item[field]).toISOString().slice(0, 10);
  });
  return item;
};

const caseFields = ["academicyear", "caseno", "court", "title", "description", "startdate", "lawyername", "party", "partycontact", "partyemail", "lawyercontact", "lawyeremail", "status"];
const hearingFields = ["caseid", "caseno", "court", "hearing", "hearingdate", "title", "topic", "outcome", "issues", "nexthearingdate", "status"];

const casePayload = (source = {}) => ({
  ...scoped(source),
  user: text(source.user),
  namecreated: text(source.namecreated || source.name || source.createdby),
  academicyear: text(source.academicyear),
  caseno: text(source.caseno),
  court: text(source.court),
  title: text(source.title),
  description: text(source.description),
  startdate: dateOnly(source.startdate),
  lawyername: text(source.lawyername),
  party: arrayText(source.party),
  partycontact: text(source.partycontact),
  partyemail: text(source.partyemail),
  lawyercontact: text(source.lawyercontact),
  lawyeremail: text(source.lawyeremail),
  status: text(source.status) || "Active"
});

const hearingPayload = async (source = {}) => {
  const payload = {
    ...scoped(source),
    user: text(source.user),
    namecreated: text(source.namecreated || source.name || source.createdby),
    caseid: text(source.caseid),
    caseno: text(source.caseno),
    court: text(source.court),
    hearing: text(source.hearing),
    hearingdate: dateOnly(source.hearingdate),
    title: text(source.title),
    topic: text(source.topic),
    outcome: text(source.outcome),
    issues: text(source.issues),
    nexthearingdate: dateOnly(source.nexthearingdate),
    status: text(source.status) || "Pending"
  };
  if (payload.caseid) {
    const linkedCase = await LegalCase.findOne({ _id: payload.caseid, colid: payload.colid }).select("caseno court").lean();
    if (linkedCase) {
      payload.caseno = linkedCase.caseno || payload.caseno;
      payload.court = linkedCase.court || payload.court;
    }
  }
  return payload;
};

const buildQuery = (source = {}, dateFields = []) => {
  const query = scoped(source);
  Object.keys(source).forEach((field) => {
    if (["colid", "user", "namecreated", "tab", "from", "to", "startdatefrom", "startdateto", "hearingdatefrom", "hearingdateto", "nexthearingdatefrom", "nexthearingdateto"].includes(field)) return;
    if (dateFields.includes(field)) return;
    if (text(source[field])) query[field] = regex(source[field]);
  });
  dateFields.forEach((field) => {
    const from = dateOnly(source[`${field}from`]);
    const to = endOfDay(source[`${field}to`]);
    if (from || to) {
      query[field] = {};
      if (from) query[field].$gte = from;
      if (to) query[field].$lte = to;
    }
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [cases, hearings, institution] = await Promise.all([
      LegalCase.find({ colid }).lean(),
      LegalCaseHearing.find({ colid }).lean(),
      InsDetails.findOne({ colid }).lean().catch(() => null)
    ]);
    res.json({
      success: true,
      institution: institution || {},
      academicyears: uniqueSorted([...cases.map((row) => row.academicyear)]),
      casenos: uniqueSorted(cases.map((row) => row.caseno)),
      courts: uniqueSorted([...cases.map((row) => row.court), ...hearings.map((row) => row.court)]),
      statuses: uniqueSorted([...cases.map((row) => row.status), ...hearings.map((row) => row.status), "Active", "Closed", "Pending", "Completed"]),
      lawyers: uniqueSorted(cases.map((row) => row.lawyername)),
      activeCases: cases.filter((row) => !/^closed$/i.test(text(row.status))).map((row) => ({
        id: row._id,
        _id: row._id,
        label: `${row.caseno || "Case"} - ${row.title || row.court || ""}`,
        caseno: row.caseno || "",
        court: row.court || "",
        title: row.title || ""
      }))
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listCases = async (req, res) => {
  try {
    const query = buildQuery(req.query, ["startdate"]);
    if (text(req.query.tab) === "active") query.status = { $not: /^closed$/i };
    if (text(req.query.tab) === "closed") query.status = /^closed$/i;
    const rows = await LegalCase.find(query).sort({ startdate: -1, updatedAt: -1 }).limit(5000);
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveCase = async (req, res) => {
  try {
    const payload = casePayload(req.body);
    const row = req.body.id
      ? await LegalCase.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await LegalCase.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Legal case not found" });
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkCases = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => casePayload({ ...row, colid: req.body.colid, user: req.body.user, namecreated: req.body.namecreated }));
    const result = docs.length ? await LegalCase.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteCases = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await LegalCase.deleteMany({ colid, _id: { $in: ids } });
    await LegalCaseHearing.deleteMany({ colid, caseid: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listHearings = async (req, res) => {
  try {
    const rows = await LegalCaseHearing.find(buildQuery(req.query, ["hearingdate", "nexthearingdate"])).sort({ hearingdate: -1, updatedAt: -1 }).limit(5000);
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveHearing = async (req, res) => {
  try {
    const payload = await hearingPayload(req.body);
    const row = req.body.id
      ? await LegalCaseHearing.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await LegalCaseHearing.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Case hearing not found" });
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkHearings = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = [];
    for (const row of rows) docs.push(await hearingPayload({ ...row, colid: req.body.colid, user: req.body.user, namecreated: req.body.namecreated }));
    const result = docs.length ? await LegalCaseHearing.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteHearings = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await LegalCaseHearing.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.upcomingHearings = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const start = dateOnly(req.query.from) || new Date();
    start.setHours(0, 0, 0, 0);
    const end = dateOnly(req.query.to) || new Date(start);
    if (!req.query.to) end.setDate(end.getDate() + 3);
    end.setHours(23, 59, 59, 999);
    const activeCases = await LegalCase.find({ colid, status: { $not: /^closed$/i } }).select("_id caseno court title lawyername").lean();
    const activeIds = activeCases.map((row) => String(row._id));
    const caseMap = new Map(activeCases.map((row) => [String(row._id), row]));
    const rows = await LegalCaseHearing.find({
      colid,
      caseid: { $in: activeIds },
      $or: [
        { hearingdate: { $gte: start, $lte: end } },
        { nexthearingdate: { $gte: start, $lte: end } }
      ]
    }).sort({ nexthearingdate: 1, hearingdate: 1 }).lean();
    res.json({
      success: true,
      rows: rows.map((row) => {
        const linked = caseMap.get(String(row.caseid)) || {};
        return toClient({ ...linked, ...row, casetitle: linked.title || row.title });
      })
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
