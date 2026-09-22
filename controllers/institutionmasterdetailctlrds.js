const InstitutionMaster = require("../Models/academicmasterinstitutionds");
const InstitutionLeadership = require("../Models/institutionleadershipds");
const InstitutionRegulatory = require("../Models/institutionregulatoryds");
const InstitutionBankAccount = require("../Models/institutionbankaccountds");
const Users = require("../Models/user");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const dateOrUndefined = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");

const configs = {
  leadership: {
    Model: InstitutionLeadership,
    required: ["institution", "useremail"],
    fields: [
      "institution",
      "institutioncode",
      "userid",
      "user",
      "useremail",
      "name",
      "leadershiprole",
      "governingbodymember",
      "appointmentdate",
      "retirementdate",
      "status"
    ],
    dates: ["appointmentdate", "retirementdate"],
    key: (doc) => ({
      colid: doc.colid,
      institution: doc.institution,
      useremail: doc.useremail,
      leadershiprole: doc.leadershiprole
    })
  },
  regulatory: {
    Model: InstitutionRegulatory,
    required: ["institution", "regulatorybody"],
    fields: [
      "institution",
      "institutioncode",
      "regulatorybody",
      "permanentid",
      "lettertype",
      "letternumber",
      "validityyear",
      "validitystartdate",
      "validityexpirydate",
      "status"
    ],
    dates: ["validitystartdate", "validityexpirydate"],
    key: (doc) => ({
      colid: doc.colid,
      institution: doc.institution,
      regulatorybody: doc.regulatorybody,
      permanentid: doc.permanentid,
      validityyear: doc.validityyear
    })
  },
  bankaccount: {
    Model: InstitutionBankAccount,
    required: ["institution", "accountnumber"],
    fields: [
      "institution",
      "institutioncode",
      "accountnumber",
      "ifsccode",
      "accountholdername",
      "accounttype",
      "bank",
      "branch",
      "location",
      "status"
    ],
    dates: [],
    key: (doc) => ({ colid: doc.colid, institution: doc.institution, accountnumber: doc.accountnumber })
  }
};

function normalizeAliases(source = {}) {
  return {
    ...source,
    useremail: source.useremail || source.email,
    name: source.name || source.username,
    accountnumber: source.accountnumber || source.accountno || source["account number"],
    ifsccode: source.ifsccode || source.ifsc || source["ifsc code"],
    accountholdername: source.accountholdername || source.accountholder || source["account holder name"],
    regulatorybody: source.regulatorybody || source.council || source.body,
    letternumber: source.letternumber || source.eoaorotherletternumber || source.eoaletternumber || source["eoa or other letter number"],
    lettertype: source.lettertype || source.letter || source.eoa
  };
}

function payload(kind, source = {}) {
  const config = configs[kind];
  const normalized = normalizeAliases(source);
  const doc = {
    colid: num(normalized.colid),
    user: text(normalized.user),
    createdby: text(normalized.createdby || normalized.user)
  };
  config.fields.forEach((field) => {
    if (config.dates.includes(field)) {
      const value = dateOrUndefined(normalized[field]);
      if (value) doc[field] = value;
    } else if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      doc[field] = text(normalized[field]);
    }
  });
  if (!doc.status) doc.status = "Active";
  return doc;
}

function filter(kind, source = {}) {
  const config = configs[kind];
  const query = { colid: num(source.colid) };
  config.fields.forEach((field) => {
    if (!config.dates.includes(field) && text(source[field])) query[field] = regex(source[field]);
  });
  return query;
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [institutions, users] = await Promise.all([
      InstitutionMaster.find({ colid }).sort({ institution: 1 }).lean(),
      Users.find({ colid, role: { $not: /^Student$/i } }).select("name email user role department designation institution").sort({ name: 1 }).limit(10000).lean()
    ]);
    res.json({ success: true, institutions, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    const config = configs[kind];
    if (!config) return res.status(400).json({ success: false, message: "Invalid institution detail type" });
    const data = await config.Model.find(filter(kind, req.query)).sort({ updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    const config = configs[kind];
    if (!config) return res.status(400).json({ success: false, message: "Invalid institution detail type" });
    const doc = payload(kind, req.body);
    const missing = config.required.filter((field) => !text(doc[field]));
    if (missing.length) return res.status(400).json({ success: false, message: `${missing.join(", ")} required` });
    const data = req.body.id
      ? await config.Model.findOneAndUpdate({ _id: req.body.id, colid: doc.colid }, doc, { new: true, runValidators: true })
      : await config.Model.findOneAndUpdate(config.key(doc), doc, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    const config = configs[kind];
    if (!config) return res.status(400).json({ success: false, message: "Invalid institution detail type" });
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await config.Model.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    const config = configs[kind];
    if (!config) return res.status(400).json({ success: false, message: "Invalid institution detail type" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const doc = payload(kind, { ...rows[index], colid: req.body.colid, user: req.body.user, createdby: req.body.user });
      const missing = config.required.filter((field) => !text(doc[field]));
      if (missing.length) {
        errors.push(`Row ${index + 2}: ${missing.join(", ")} required`);
        continue;
      }
      await config.Model.findOneAndUpdate(config.key(doc), doc, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
      saved += 1;
    }
    res.json({ success: true, inserted: saved, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
