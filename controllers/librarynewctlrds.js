const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const LibraryBook = require("../Models/librarybookds");
const LibraryFine = require("../Models/libraryfinecategoryds");
const LibraryIssue = require("../Models/libraryissueds");
const LibraryRequest = require("../Models/libraryrequestds");
const LibraryPhotocopyRequest = require("../Models/libraryphotocopyrequestds");
const LibraryMaster = require("../Models/librarymasterds");
const LibraryAccess = require("../Models/libraryaccessds");
const LibraryTransfer = require("../Models/librarytransferds");
const LibraryLoan = require("../Models/libraryloands");
const LibraryRoleMaxBooks = require("../Models/libraryrolemaxbooksds");
const LibraryRoleMaxDays = require("../Models/libraryrolemaxdaysds");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage() });

const libraryFields = ["libraryname", "description", "type", "status"];
const bookFields = [
  "libraryid", "libraryname", "accessionno", "title", "author", "classification", "publisher", "publisheraddress",
  "isbn", "category", "subject", "edition", "publicationyear", "language", "rackno", "shelfno", "location",
  "supplier", "invoiceno", "invoicedate", "keywords", "purchasedate",
  "price", "pages", "status", "remarks"
];
const studentFields = ["academicyear", "program", "programcode", "semester", "section", "name", "email", "phone", "regno", "major", "minor"];
const issueFields = ["libraryid", "libraryname", "accessionno", "title", "classification", "publisher", "publisheraddress", "category", "keywords", "invoiceno", "student", "regno", "email", "programcode", "academicyear", "semester", "issuetype", "status"];
const roleMaxBooksFields = ["role", "bookcategory", "noofbooks", "default"];
const roleMaxDaysFields = ["role", "bookcategory", "noofdays"];
const ledgerFields = ["academicyear", "program", "programcode", "regulation", "semester", "student", "regno", "feegroup", "feeitem", "status"];
const userFields = ["name", "email", "user", "role", "department", "phone"];
const photocopyFields = ["libraryname", "student", "regno", "email", "programcode", "semester", "title", "accessionno", "status"];
const issueTypes = ["Regular", "Reference", "Reading Room", "Faculty Issue", "Special"];
const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function date(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function regex(value) {
  return new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function escRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid, type: /^aws$/i }).sort({ default: -1, _id: -1 }).lean();

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""
);

const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGeminiText = async ({ colid, model, prompt }) => {
  const config = await getDefaultGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const selectedModel = text(model) || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25 }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini summary failed");
  return readGeminiText(data) || "Gemini did not return a summary.";
};

const callOllamaText = async ({ colid, ollamaId, prompt }) => {
  const config = ollamaId
    ? await OllamaConfiguration.findOne({ _id: ollamaId, colid, active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${config.serveraddress.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama summary failed");
  return data.response || "Ollama did not return a summary.";
};

function dayStart(value) {
  const parsed = date(value);
  if (!parsed) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function dayEnd(value) {
  const parsed = date(value);
  if (!parsed) return null;
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

function applyFilters(query, source, fields) {
  fields.forEach((field) => {
    const value = source[field];
    if (!text(value)) return;
    if (["title", "author", "classification", "publisher", "publisheraddress", "keywords", "invoiceno", "student", "name", "email", "phone", "regno", "feeitem", "feegroup", "accessionno", "libraryname", "description"].includes(field)) query[field] = regex(value);
    else query[field] = value;
  });
}

async function getLibrary(colid, libraryid) {
  const value = text(libraryid);
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) {
    const byId = await LibraryMaster.findOne({ _id: value, colid }).lean();
    if (byId) return byId;
  }
  return await LibraryMaster.findOne({ colid, libraryname: new RegExp(`^${escRegex(value)}$`, "i") }).lean();
}

function libraryPayload(library = {}) {
  return {
    libraryid: library?._id ? String(library._id) : text(library.libraryid),
    libraryname: text(library.libraryname),
    librarytype: text(library.type || library.librarytype)
  };
}

async function accessibleLibraries(colid, email, includeAll = false) {
  const all = await LibraryMaster.find({ colid, status: { $ne: "Inactive" } }).sort({ libraryname: 1 }).lean();
  if (includeAll || !text(email)) return all;
  const access = await LibraryAccess.find({ colid, email: text(email).toLowerCase(), status: /^Active$/i }).lean();
  const allowed = new Set(access.map((row) => text(row.libraryid)).filter(Boolean));
  return all.filter((row) => allowed.has(String(row._id)));
}

async function applyLibraryAccess(query, colid, source = {}, studentMode = false) {
  if (text(source.libraryid)) {
    query.libraryid = text(source.libraryid);
    return query;
  }
  if (studentMode) return query;
  if (/^all$/i.test(text(source.role))) return query;
  const libs = await accessibleLibraries(colid, source.user || source.email);
  query.libraryid = { $in: libs.map((row) => String(row._id)) };
  return query;
}

async function bookPayload(body, colid) {
  const payload = {};
  bookFields.forEach((field) => {
    if (["libraryname", "libraryid"].includes(field)) return;
    if (["price", "pages"].includes(field)) payload[field] = number(body[field], 0);
    else if (field === "purchasedate" || field === "invoicedate") payload[field] = date(body[field]);
    else payload[field] = text(body[field]);
  });
  const library = await getLibrary(colid, body.libraryid || body.libraryname);
  Object.assign(payload, libraryPayload(library || body));
  payload.barcodevalue = text(body.barcodevalue) || payload.accessionno;
  payload.qrcodeurl = text(body.qrcodeurl);
  payload.user = text(body.user);
  return payload;
}

async function distinctOptions(Model, colid, fields, base = {}) {
  const pairs = await Promise.all(fields.map(async (field) => {
    const values = await Model.distinct(field, { colid, ...base });
    return [field, [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }));
  return Object.fromEntries(pairs);
}

async function getStudent(colid, source = {}) {
  const query = { colid };
  if (text(source.regno)) query.regno = text(source.regno);
  else if (text(source.email)) query.email = text(source.email);
  else if (text(source.user)) query.email = text(source.user);
  else return null;
  return await User.findOne(query).lean();
}

function studentPayload(student = {}) {
  return {
    student: student.name || student.student || "",
    regno: student.regno || "",
    email: student.email || student.user || "",
    role: student.role || "",
    phone: student.phone || "",
    program: student.program || "",
    programcode: student.programcode || "",
    academicyear: student.academicyear || student.admissionyear || "",
    semester: student.semester || "",
    section: student.section || ""
  };
}

function userLookupQuery(colid, identifier) {
  const value = text(identifier);
  return {
    colid,
    $or: [
      { regno: new RegExp(`^${escRegex(value)}$`, "i") },
      { email: new RegExp(`^${escRegex(value)}$`, "i") },
      { user: new RegExp(`^${escRegex(value)}$`, "i") }
    ]
  };
}

async function findRoleMaxBooks(colid, role, category) {
  const exact = await LibraryRoleMaxBooks.findOne({ colid, role: new RegExp(`^${escRegex(role)}$`, "i"), bookcategory: new RegExp(`^${escRegex(category)}$`, "i") }).lean();
  if (exact) return exact;
  return await LibraryRoleMaxBooks.findOne({
    colid,
    default: /^Yes$/i,
    $or: [
      { role: new RegExp(`^${escRegex(role)}$`, "i"), bookcategory: new RegExp(`^${escRegex(category)}$`, "i") },
      { role: new RegExp(`^${escRegex(role)}$`, "i") },
      { bookcategory: new RegExp(`^${escRegex(category)}$`, "i") }
    ]
  }).lean();
}

async function findRoleMaxDays(colid, role, category) {
  const exact = await LibraryRoleMaxDays.findOne({ colid, role: new RegExp(`^${escRegex(role)}$`, "i"), bookcategory: new RegExp(`^${escRegex(category)}$`, "i") }).lean();
  if (exact) return exact;
  return await LibraryRoleMaxDays.findOne({
    colid,
    $or: [
      { role: new RegExp(`^${escRegex(role)}$`, "i") },
      { bookcategory: new RegExp(`^${escRegex(category)}$`, "i") }
    ]
  }).lean();
}

async function issueEligibility(colid, profile, book) {
  const role = text(profile.role) || "Student";
  const category = text(book.category) || "General";
  const maxRule = await findRoleMaxBooks(colid, role, category);
  const maxBooks = number(maxRule?.noofbooks, 0);
  const issueKey = text(profile.regno) || text(profile.email) || text(profile.user);
  const activeQuery = { colid, status: /^Issued$/i, category: new RegExp(`^${escRegex(category)}$`, "i") };
  if (text(profile.regno)) activeQuery.regno = text(profile.regno);
  else activeQuery.email = text(profile.email || profile.user).toLowerCase();
  const activeCount = await LibraryIssue.countDocuments(activeQuery);
  const allowed = !maxBooks || activeCount < maxBooks;
  const dayRule = await findRoleMaxDays(colid, role, category);
  const noofdays = number(dayRule?.noofdays, 14);
  const issuedate = new Date();
  const duedate = new Date(issuedate);
  duedate.setDate(duedate.getDate() + noofdays);
  return {
    allowed,
    activeCount,
    maxBooks,
    noofdays,
    issuedate,
    duedate,
    issueKey,
    message: allowed ? "Book can be issued" : `Maximum ${maxBooks} ${category} book(s) already issued for this role`
  };
}

async function fineForIssue(issue, returndate) {
  const fineRule = await LibraryFine.findOne({ colid: issue.colid, category: issue.category, status: /^Active$/i }).lean();
  const due = issue.duedate ? new Date(issue.duedate) : null;
  let lateDays = 0;
  if (due && returndate > due) lateDays = Math.ceil((returndate - due) / (1000 * 60 * 60 * 24));
  const billableDays = Math.max(0, lateDays - number(fineRule?.graceperioddays, 0));
  let fine = billableDays * number(fineRule?.fineperday, 0);
  const maxFine = number(fineRule?.maxfine, 0);
  if (maxFine > 0) fine = Math.min(fine, maxFine);
  return { fine, lateDays };
}

function totals(rows) {
  return rows.reduce((sum, row) => ({
    count: sum.count + 1,
    amount: sum.amount + number(row.amount, 0),
    paid: sum.paid + number(row.paid, 0),
    concession: sum.concession + number(row.concession, 0),
    balance: sum.balance + number(row.balance, 0),
    fine: sum.fine + number(row.fineamount, 0)
  }), { count: 0, amount: 0, paid: 0, concession: 0, balance: 0, fine: 0 });
}

function group(rows, field, valueField = "count") {
  const map = new Map();
  rows.forEach((row) => {
    const key = text(row[field]) || "Not specified";
    const current = map.get(key) || { label: key, count: 0, amount: 0, paid: 0, balance: 0, fine: 0 };
    current.count += 1;
    current.amount += number(row.amount, 0);
    current.paid += number(row.paid, 0);
    current.balance += number(row.balance, 0);
    current.fine += number(row.fineamount, 0);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => number(b[valueField], 0) - number(a[valueField], 0));
}

function monthKey(value) {
  const parsed = date(value);
  if (!parsed) return "Not specified";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function groupByMonth(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const key = monthKey(row[field] || row.createdAt);
    const current = map.get(key) || { label: key, count: 0 };
    current.count += 1;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function randomPick(list = [], index = 0) {
  if (!list.length) return null;
  return list[index % list.length];
}

function addDays(base, days) {
  const value = new Date(base);
  value.setDate(value.getDate() + days);
  return value;
}

exports.libraries = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, libraryFields);
    const data = await LibraryMaster.find(query).sort({ libraryname: 1 }).lean();
    res.json({ success: true, data, options: await distinctOptions(LibraryMaster, colid, libraryFields) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.accessibleLibraryList = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const data = await accessibleLibraries(colid, req.query.user || req.query.email, String(req.query.all || "").toLowerCase() === "yes");
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveLibrary = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const payload = {
      colid,
      libraryname: text(req.body.libraryname),
      description: text(req.body.description),
      type: text(req.body.type) || "University",
      status: text(req.body.status) || "Active",
      user: text(req.body.user)
    };
    if (!payload.libraryname) return res.status(400).json({ success: false, message: "Library name is required" });
    const data = req.body.id
      ? await LibraryMaster.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await LibraryMaster.findOneAndUpdate({ colid, libraryname: payload.libraryname }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLibrary = async (req, res) => {
  try {
    await LibraryMaster.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, undefined) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.userOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    res.json({ success: true, fields: userFields, options: await distinctOptions(User, colid, userFields, { role: { $not: /^Student$/i } }) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.users = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid, role: { $not: /^Student$/i } };
    applyFilters(query, req.query, userFields);
    const data = await User.find(query).select("name email user role department phone").sort({ name: 1 }).limit(1000).lean();
    res.json({ success: true, data, options: await distinctOptions(User, colid, userFields, { role: { $not: /^Student$/i } }) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.accessList = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, ["libraryname", "email", "name", "role", "department", "status"]);
    const data = await LibraryAccess.find(query).sort({ libraryname: 1, name: 1 }).lean();
    res.json({ success: true, data, options: await distinctOptions(LibraryAccess, colid, ["libraryname", "email", "name", "role", "department", "status"]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAccess = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const user = await User.findOne({ _id: req.body.userid, colid }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const libraryids = Array.isArray(req.body.libraryids) ? req.body.libraryids : [req.body.libraryid].filter(Boolean);
    let saved = 0;
    for (const libraryid of libraryids) {
      const library = await getLibrary(colid, libraryid);
      if (!library) continue;
      const payload = {
        colid,
        ...libraryPayload(library),
        name: user.name || "",
        email: text(user.email || user.user).toLowerCase(),
        role: user.role || "",
        department: user.department || "",
        status: "Active",
        user: text(req.body.user)
      };
      await LibraryAccess.findOneAndUpdate({ colid, libraryid: String(library._id), email: payload.email }, payload, { upsert: true, setDefaultsOnInsert: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAccess = async (req, res) => {
  try {
    await LibraryAccess.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, undefined) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bookOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const base = {};
    await applyLibraryAccess(base, colid, req.query);
    res.json({ success: true, fields: bookFields, options: await distinctOptions(LibraryBook, colid, bookFields, base), libraries: await accessibleLibraries(colid, req.query.user || req.query.email) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.books = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    await applyLibraryAccess(query, colid, req.query);
    applyFilters(query, req.query, bookFields);
    const data = await LibraryBook.find(query).sort({ accessionno: 1 }).limit(5000).lean();
    const optionBase = {};
    await applyLibraryAccess(optionBase, colid, req.query);
    res.json({ success: true, data, options: await distinctOptions(LibraryBook, colid, bookFields, optionBase), libraries: await accessibleLibraries(colid, req.query.user || req.query.email) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { ...(await bookPayload(req.body, colid)), colid };
    if (!payload.libraryid || !payload.accessionno || !payload.title) return res.status(400).json({ success: false, message: "Library, accession number and title are required" });
    const data = req.body.id
      ? await LibraryBook.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await LibraryBook.findOneAndUpdate({ colid, libraryid: payload.libraryid, accessionno: payload.accessionno }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    await LibraryBook.findOneAndDelete({ _id: req.body.id, colid });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkBooks = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (colid === undefined || !rows.length) return res.status(400).json({ success: false, message: "colid and rows are required" });
    let saved = 0;
    for (const row of rows) {
      const payload = { ...(await bookPayload({ ...row, user: req.body.user }, colid)), colid };
      if (!payload.libraryid || !payload.accessionno || !payload.title) continue;
      await LibraryBook.findOneAndUpdate({ colid, libraryid: payload.libraryid, accessionno: payload.accessionno }, payload, { upsert: true, setDefaultsOnInsert: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fines = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const data = await LibraryFine.find({ colid }).sort({ category: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveFine = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const payload = {
      colid,
      category: text(req.body.category),
      fineperday: number(req.body.fineperday, 0),
      graceperioddays: number(req.body.graceperioddays, 0),
      maxfine: number(req.body.maxfine, 0),
      status: text(req.body.status) || "Active",
      remarks: text(req.body.remarks),
      user: text(req.body.user)
    };
    if (!payload.category) return res.status(400).json({ success: false, message: "Category is required" });
    const data = req.body.id
      ? await LibraryFine.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await LibraryFine.findOneAndUpdate({ colid, category: payload.category }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteFine = async (req, res) => {
  try {
    await LibraryFine.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, undefined) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const base = { colid, role: /^Student$/i };
    res.json({ success: true, fields: studentFields, options: await distinctOptions(User, colid, studentFields, { role: /^Student$/i }) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.students = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid, role: /^Student$/i };
    applyFilters(query, req.query, studentFields);
    const data = await User.find(query).select("name email user phone regno academicyear admissionyear program programcode semester section major minor").limit(1000).lean();
    res.json({ success: true, data, options: await distinctOptions(User, colid, studentFields, { role: /^Student$/i }) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.issueBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const accessionno = text(req.body.accessionno);
    if (colid === undefined || !accessionno || !text(req.body.regno)) return res.status(400).json({ success: false, message: "Accession no and student regno are required" });
    const bookQuery = { colid, accessionno };
    if (text(req.body.libraryid)) bookQuery.libraryid = text(req.body.libraryid);
    const book = await LibraryBook.findOne(bookQuery);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    if (!/^Available$/i.test(book.status || "")) return res.status(400).json({ success: false, message: "Book is not available" });
    const student = await getStudent(colid, { regno: req.body.regno }) || {};
    const payload = {
      colid,
      ...libraryPayload(book),
      accessionno,
      bookid: String(book._id),
      title: book.title,
      author: book.author,
      classification: book.classification,
      publisher: book.publisher,
      publisheraddress: book.publisheraddress,
      invoiceno: book.invoiceno,
      invoicedate: book.invoicedate,
      keywords: book.keywords,
      category: book.category,
      ...studentPayload(student),
      issuetype: text(req.body.issuetype) || "Regular",
      issuedate: date(req.body.issuedate) || new Date(),
      duedate: date(req.body.duedate),
      status: "Issued",
      remarks: text(req.body.remarks),
      issuedby: text(req.body.user),
      requestid: text(req.body.requestid),
      user: text(req.body.user)
    };
    if (text(req.body.student)) payload.student = text(req.body.student);
    if (text(req.body.email)) payload.email = text(req.body.email);
    if (text(req.body.phone)) payload.phone = text(req.body.phone);
    const data = await LibraryIssue.create(payload);
    book.status = "Issued";
    await book.save();
    if (payload.requestid) await LibraryRequest.findOneAndUpdate({ _id: payload.requestid, colid }, { status: "Issued", actiondate: new Date(), actionby: text(req.body.user) });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.issues = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    await applyLibraryAccess(query, colid, req.query);
    applyFilters(query, req.query, issueFields);
    const from = dayStart(req.query.fromdate);
    const to = dayEnd(req.query.todate);
    if (from || to) query.issuedate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const data = await LibraryIssue.find(query).sort({ issuedate: -1 }).limit(5000).lean();
    const optionBase = {};
    await applyLibraryAccess(optionBase, colid, req.query);
    res.json({ success: true, data, options: await distinctOptions(LibraryIssue, colid, issueFields, optionBase), libraries: await accessibleLibraries(colid, req.query.user || req.query.email) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.returnBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const issue = await LibraryIssue.findOne({ _id: req.body.id, colid });
    if (!issue) return res.status(404).json({ success: false, message: "Issue record not found" });
    if (/^Returned$/i.test(issue.status || "")) return res.status(400).json({ success: false, message: "Book already returned" });
    const returndate = date(req.body.returndate) || new Date();
    const fineRule = await LibraryFine.findOne({ colid, category: issue.category, status: /^Active$/i }).lean();
    const due = issue.duedate ? new Date(issue.duedate) : null;
    let lateDays = 0;
    if (due && returndate > due) lateDays = Math.ceil((returndate - due) / (1000 * 60 * 60 * 24));
    const billableDays = Math.max(0, lateDays - number(fineRule?.graceperioddays, 0));
    let fine = billableDays * number(fineRule?.fineperday, 0);
    const maxFine = number(fineRule?.maxfine, 0);
    if (maxFine > 0) fine = Math.min(fine, maxFine);
    fine = number(req.body.fineamount, fine);
    issue.returndate = returndate;
    issue.fineamount = fine;
    issue.status = "Returned";
    issue.returnedby = text(req.body.user);
    issue.remarks = text(req.body.remarks) || issue.remarks;
    if (fine > 0) {
      const ledger = await Ledgerstud.create({
        name: issue.student,
        user: issue.email || issue.regno,
        feegroup: "Library Fine",
        regno: issue.regno,
        student: issue.student,
        feeitem: `Library fine - ${issue.accessionno}`,
        amount: fine,
        paid: 0,
        concession: 0,
        balance: fine,
        academicyear: issue.academicyear || "NA",
        colid,
        classdate: new Date(),
        duedate: new Date(),
        status: "Active",
        programcode: issue.programcode,
        semester: issue.semester,
        comments: `Late return for ${issue.title}`
      });
      issue.ledgerid = String(ledger._id);
    }
    await issue.save();
    const bookQuery = { colid, accessionno: issue.accessionno };
    if (issue.libraryid) bookQuery.libraryid = issue.libraryid;
    await LibraryBook.findOneAndUpdate(bookQuery, { status: "Available" });
    res.json({ success: true, data: issue, fineamount: fine, latedays: lateDays });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.roleMaxBooks = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, roleMaxBooksFields);
    const [data, roles, categories] = await Promise.all([
      LibraryRoleMaxBooks.find(query).sort({ role: 1, bookcategory: 1 }).lean(),
      User.distinct("role", { colid }),
      LibraryBook.distinct("category", { colid })
    ]);
    res.json({
      success: true,
      data,
      options: {
        ...(await distinctOptions(LibraryRoleMaxBooks, colid, roleMaxBooksFields)),
        role: [...new Set([...(roles || []), "Student", "Faculty", "All"].map(text).filter(Boolean))].sort(),
        bookcategory: [...new Set([...(categories || []), "General"].map(text).filter(Boolean))].sort()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRoleMaxBooks = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const payload = {
      colid,
      role: text(req.body.role),
      bookcategory: text(req.body.bookcategory),
      noofbooks: number(req.body.noofbooks, 0),
      default: text(req.body.default) || "No",
      user: text(req.body.user)
    };
    if (!payload.role || !payload.bookcategory) return res.status(400).json({ success: false, message: "Role and book category are required" });
    const data = req.body.id
      ? await LibraryRoleMaxBooks.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await LibraryRoleMaxBooks.findOneAndUpdate({ colid, role: payload.role, bookcategory: payload.bookcategory }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRoleMaxBooks = async (req, res) => {
  try {
    await LibraryRoleMaxBooks.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, undefined) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkRoleMaxBooks = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    for (const row of rows) {
      if (!text(row.role) || !text(row.bookcategory)) continue;
      const payload = {
        colid: number(req.body.colid, undefined),
        role: text(row.role),
        bookcategory: text(row.bookcategory),
        noofbooks: number(row.noofbooks, 0),
        default: text(row.default) || "No",
        user: text(req.body.user)
      };
      await LibraryRoleMaxBooks.findOneAndUpdate({ colid: payload.colid, role: payload.role, bookcategory: payload.bookcategory }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.counterFindUser = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const identifier = text(req.query.identifier);
    if (!identifier) return res.status(400).json({ success: false, message: "Reg no or email is required" });
    const profile = await User.findOne(userLookupQuery(colid, identifier)).select("-password").lean();
    if (!profile) return res.status(404).json({ success: false, message: "User not found" });
    const issueKey = text(profile.regno) || text(profile.email) || text(profile.user);
    const issueQuery = { colid, status: /^Issued$/i };
    if (text(profile.regno)) issueQuery.regno = text(profile.regno);
    else issueQuery.email = text(profile.email || profile.user).toLowerCase();
    const active = await LibraryIssue.find(issueQuery).sort({ issuedate: -1 }).lean();
    const historyQuery = { colid };
    if (text(profile.regno)) historyQuery.regno = text(profile.regno);
    else historyQuery.email = text(profile.email || profile.user).toLowerCase();
    const history = await LibraryIssue.find(historyQuery).sort({ issuedate: -1, createdAt: -1 }).limit(500).lean();
    res.json({ success: true, profile: { ...profile, issuekey: issueKey }, active, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.counterLoadBook = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const accessionno = text(req.query.accessionno);
    if (!accessionno) return res.status(400).json({ success: false, message: "Accession no is required" });
    const book = await LibraryBook.findOne({ colid, accessionno }).lean();
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    const issue = await LibraryIssue.findOne({ colid, accessionno, status: /^Issued$/i }).lean();
    let eligibility = null;
    if (text(req.query.identifier)) {
      const profile = await User.findOne(userLookupQuery(colid, req.query.identifier)).lean();
      if (profile) eligibility = await issueEligibility(colid, profile, book);
    }
    res.json({ success: true, book, issue, eligibility });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.counterIssueBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const profile = await User.findOne(userLookupQuery(colid, req.body.identifier)).lean();
    if (!profile) return res.status(404).json({ success: false, message: "User not found" });
    const book = await LibraryBook.findOne({ colid, accessionno: text(req.body.accessionno) });
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    if (!/^Available$/i.test(book.status || "")) return res.status(400).json({ success: false, message: "Book is not available" });
    const eligibility = await issueEligibility(colid, profile, book);
    if (!eligibility.allowed) return res.status(400).json({ success: false, message: eligibility.message, eligibility });
    const issueKey = text(profile.regno) || text(profile.email) || text(profile.user);
    const payload = {
      colid,
      ...libraryPayload(book),
      accessionno: book.accessionno,
      bookid: String(book._id),
      title: book.title,
      author: book.author,
      classification: book.classification,
      publisher: book.publisher,
      publisheraddress: book.publisheraddress,
      invoiceno: book.invoiceno,
      invoicedate: book.invoicedate,
      keywords: book.keywords,
      category: book.category,
      ...studentPayload(profile),
      regno: issueKey,
      issuetype: text(req.body.issuetype) || "Regular",
      issuedate: eligibility.issuedate,
      duedate: eligibility.duedate,
      status: "Issued",
      remarks: text(req.body.remarks),
      issuedby: text(req.body.user),
      user: text(req.body.user)
    };
    const data = await LibraryIssue.create(payload);
    book.status = "Issued";
    await book.save();
    res.json({ success: true, data, eligibility });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.counterReturnBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const issue = await LibraryIssue.findOne({ _id: req.body.id, colid });
    if (!issue) return res.status(404).json({ success: false, message: "Issue record not found" });
    if (/^Returned$/i.test(issue.status || "")) return res.status(400).json({ success: false, message: "Book already returned" });
    const returndate = date(req.body.returndate) || new Date();
    const { fine, lateDays } = await fineForIssue(issue, returndate);
    issue.returndate = returndate;
    issue.fineamount = fine;
    issue.status = "Returned";
    issue.returnedby = text(req.body.user);
    issue.remarks = text(req.body.remarks) || issue.remarks;
    if (fine > 0 && /^Student$/i.test(issue.role || "")) {
      const ledger = await Ledgerstud.create({
        name: issue.student,
        user: issue.email || issue.regno,
        feegroup: "Library Fine",
        regno: issue.regno,
        student: issue.student,
        feeitem: `Library fine - ${issue.accessionno}`,
        amount: fine,
        paid: 0,
        concession: 0,
        balance: fine,
        academicyear: issue.academicyear || "NA",
        colid,
        classdate: new Date(),
        duedate: new Date(),
        status: "Active",
        programcode: issue.programcode,
        semester: issue.semester,
        comments: `Late return for ${issue.title}`
      });
      issue.ledgerid = String(ledger._id);
    }
    await issue.save();
    const bookQuery = { colid, accessionno: issue.accessionno };
    if (issue.libraryid) bookQuery.libraryid = issue.libraryid;
    await LibraryBook.findOneAndUpdate(bookQuery, { status: "Available" });
    res.json({ success: true, data: issue, fineamount: fine, latedays: lateDays });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.roleMaxDays = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, roleMaxDaysFields);
    const [data, roles, categories] = await Promise.all([
      LibraryRoleMaxDays.find(query).sort({ role: 1, bookcategory: 1 }).lean(),
      User.distinct("role", { colid }),
      LibraryBook.distinct("category", { colid })
    ]);
    res.json({
      success: true,
      data,
      options: {
        ...(await distinctOptions(LibraryRoleMaxDays, colid, roleMaxDaysFields)),
        role: [...new Set([...(roles || []), "Student", "Faculty", "All"].map(text).filter(Boolean))].sort(),
        bookcategory: [...new Set([...(categories || []), "General"].map(text).filter(Boolean))].sort()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRoleMaxDays = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const payload = {
      colid,
      role: text(req.body.role),
      bookcategory: text(req.body.bookcategory),
      noofdays: number(req.body.noofdays, 0),
      user: text(req.body.user)
    };
    if (!payload.role || !payload.bookcategory) return res.status(400).json({ success: false, message: "Role and book category are required" });
    const data = req.body.id
      ? await LibraryRoleMaxDays.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await LibraryRoleMaxDays.findOneAndUpdate({ colid, role: payload.role, bookcategory: payload.bookcategory }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRoleMaxDays = async (req, res) => {
  try {
    await LibraryRoleMaxDays.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, undefined) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkRoleMaxDays = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    for (const row of rows) {
      if (!text(row.role) || !text(row.bookcategory)) continue;
      const payload = {
        colid: number(req.body.colid, undefined),
        role: text(row.role),
        bookcategory: text(row.bookcategory),
        noofdays: number(row.noofdays, 0),
        user: text(req.body.user)
      };
      await LibraryRoleMaxDays.findOneAndUpdate({ colid: payload.colid, role: payload.role, bookcategory: payload.bookcategory }, payload, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.opac = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    await applyLibraryAccess(query, colid, req.query, true);
    applyFilters(query, req.query, bookFields);
    const data = await LibraryBook.find(query).sort({ title: 1 }).limit(1000).lean();
    const optionBase = {};
    if (text(req.query.libraryid)) optionBase.libraryid = text(req.query.libraryid);
    res.json({ success: true, data, options: await distinctOptions(LibraryBook, colid, bookFields, optionBase), libraries: await accessibleLibraries(colid, null, true) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const book = await LibraryBook.findOne({ _id: req.body.bookid, colid }).lean();
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    if (!/^Available$/i.test(book.status || "")) return res.status(400).json({ success: false, message: "No available copy for this book" });
    const student = await getStudent(colid, { regno: req.body.regno, email: req.body.email, user: req.body.user });
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const existing = await LibraryRequest.findOne({ colid, accessionno: book.accessionno, regno: student.regno, status: /^Requested$/i });
    if (existing) return res.status(400).json({ success: false, message: "Request already exists" });
    const data = await LibraryRequest.create({
      colid,
      ...libraryPayload(book),
      accessionno: book.accessionno,
      bookid: String(book._id),
      title: book.title,
      author: book.author,
      classification: book.classification,
      publisher: book.publisher,
      publisheraddress: book.publisheraddress,
      invoiceno: book.invoiceno,
      invoicedate: book.invoicedate,
      keywords: book.keywords,
      category: book.category,
      ...studentPayload(student),
      status: "Requested",
      remarks: text(req.body.remarks),
      user: student.email || student.user
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requests = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    await applyLibraryAccess(query, colid, req.query);
    applyFilters(query, req.query, [...issueFields, "program", "semester"]);
    const data = await LibraryRequest.find(query).sort({ requestdate: -1 }).limit(3000).lean();
    const optionBase = {};
    await applyLibraryAccess(optionBase, colid, req.query);
    res.json({ success: true, data, options: await distinctOptions(LibraryRequest, colid, [...issueFields, "program", "semester", "status"], optionBase), libraries: await accessibleLibraries(colid, req.query.user || req.query.email) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const data = await LibraryRequest.findOneAndUpdate(
      { _id: req.body.id, colid: number(req.body.colid, undefined) },
      { status: "Rejected", actiondate: new Date(), actionby: text(req.body.user), remarks: text(req.body.remarks) },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadMiddleware = upload.single("file");

exports.aiOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const [gemini, ollama] = await Promise.all([
      AiConfiguration.find({ colid, type: /^gemini$/i, active: /^yes$/i }).select("description default active").lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).select("name serveraddress modelname default active").sort({ default: -1, name: 1 }).lean()
    ]);
    res.json({ success: true, geminiConfigured: gemini.length > 0, geminiModels, ollama });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load AI options" });
  }
};

exports.summarizeBook = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const book = await LibraryBook.findOne({ _id: req.body.bookid, colid }).lean();
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    const prompt = [
      "Create a concise student-friendly summary of the following library book.",
      "Do not claim to have read the full book. Use only the metadata provided and clearly infer from title/subject/keywords.",
      "Include: likely topic coverage, who should read it, and 5 useful study/search keywords.",
      "",
      `Title: ${book.title || ""}`,
      `Author: ${book.author || ""}`,
      `Subject: ${book.subject || ""}`,
      `Category: ${book.category || ""}`,
      `Classification: ${book.classification || ""}`,
      `Publisher: ${book.publisher || ""}`,
      `Publication Year: ${book.publicationyear || ""}`,
      `Language: ${book.language || ""}`,
      `Keywords: ${book.keywords || ""}`,
      `Remarks: ${book.remarks || ""}`
    ].join("\n");
    const provider = text(req.body.provider || "Gemini");
    const summary = /^ollama$/i.test(provider)
      ? await callOllamaText({ colid, ollamaId: req.body.ollamaId || req.body.ollamaConfigId, prompt })
      : await callGeminiText({ colid, model: req.body.geminiModel, prompt });
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to summarize book" });
  }
};

exports.requestPhotocopy = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const book = await LibraryBook.findOne({ _id: req.body.bookid, colid }).lean();
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    const frompage = number(req.body.frompage, 0);
    const topage = number(req.body.topage, 0);
    if (!frompage || !topage || topage < frompage) return res.status(400).json({ success: false, message: "Valid from page and to page are required" });
    if (number(book.pages, 0) && topage > number(book.pages, 0)) return res.status(400).json({ success: false, message: `To page cannot exceed total pages (${book.pages})` });
    const student = await getStudent(colid, { regno: req.body.regno, email: req.body.email, user: req.body.user });
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const existing = await LibraryPhotocopyRequest.findOne({
      colid,
      accessionno: book.accessionno,
      regno: student.regno,
      frompage,
      topage,
      status: { $in: ["Requested", "Uploaded"] }
    });
    if (existing) return res.status(400).json({ success: false, message: "Photocopy request already exists for this page range" });
    const data = await LibraryPhotocopyRequest.create({
      colid,
      ...libraryPayload(book),
      accessionno: book.accessionno,
      bookid: String(book._id),
      title: book.title,
      author: book.author,
      classification: book.classification,
      publisher: book.publisher,
      category: book.category,
      frompage,
      topage,
      ...studentPayload(student),
      status: "Requested",
      remarks: text(req.body.remarks),
      user: student.email || student.user
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to create photocopy request" });
  }
};

exports.studentPhotocopyRequests = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    const or = [];
    if (text(req.query.regno)) or.push({ regno: text(req.query.regno) });
    if (text(req.query.email)) or.push({ email: text(req.query.email).toLowerCase() });
    if (text(req.query.user)) or.push({ email: text(req.query.user).toLowerCase() });
    if (or.length) query.$or = or;
    if (text(req.query.libraryid)) query.libraryid = text(req.query.libraryid);
    const data = await LibraryPhotocopyRequest.find(query).sort({ requestdate: -1, createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load photocopy requests" });
  }
};

exports.photocopyRequests = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    await applyLibraryAccess(query, colid, req.query);
    applyFilters(query, req.query, photocopyFields);
    const data = await LibraryPhotocopyRequest.find(query).sort({ requestdate: -1, createdAt: -1 }).limit(3000).lean();
    const optionBase = {};
    await applyLibraryAccess(optionBase, colid, req.query);
    res.json({ success: true, data, options: await distinctOptions(LibraryPhotocopyRequest, colid, photocopyFields, optionBase), libraries: await accessibleLibraries(colid, req.query.user || req.query.email) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load photocopy requests" });
  }
};

exports.rejectPhotocopyRequest = async (req, res) => {
  try {
    const data = await LibraryPhotocopyRequest.findOneAndUpdate(
      { _id: req.body.id, colid: number(req.body.colid, undefined) },
      { status: "Rejected", actiondate: new Date(), actionby: text(req.body.user), remarks: text(req.body.remarks) },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to reject photocopy request" });
  }
};

exports.uploadPhotocopy = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const request = await LibraryPhotocopyRequest.findOne({ _id: req.body.id, colid });
    if (!request) return res.status(404).json({ success: false, message: "Photocopy request not found" });
    if (!req.file) return res.status(400).json({ success: false, message: "Upload file is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/library/photocopy-requests/${request._id}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    request.documentlink = s3Url(config.bucket, config.region, key);
    request.filename = cleanName;
    request.status = "Uploaded";
    request.actiondate = new Date();
    request.actionby = text(req.body.user);
    request.remarks = text(req.body.remarks) || request.remarks;
    await request.save();
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to upload photocopy" });
  }
};

exports.scanBook = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const accessionno = text(req.query.accessionno);
    const query = { colid, accessionno };
    if (text(req.query.libraryid)) query.libraryid = text(req.query.libraryid);
    const book = await LibraryBook.findOne(query).lean();
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    const issueQuery = { colid, accessionno, status: /^Issued$/i };
    if (book.libraryid) issueQuery.libraryid = book.libraryid;
    const issue = await LibraryIssue.findOne(issueQuery).lean();
    res.json({ success: true, book, issue });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reports = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const issueQuery = { colid };
    await applyLibraryAccess(issueQuery, colid, req.query);
    applyFilters(issueQuery, req.query, issueFields);
    const from = dayStart(req.query.fromdate);
    const to = dayEnd(req.query.todate);
    if (from || to) issueQuery.issuedate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const scopeQuery = { colid };
    if (issueQuery.libraryid) scopeQuery.libraryid = issueQuery.libraryid;
    const [books, issues, requests] = await Promise.all([
      LibraryBook.find(scopeQuery).lean(),
      LibraryIssue.find(issueQuery).sort({ issuedate: -1 }).limit(5000).lean(),
      LibraryRequest.find(scopeQuery).sort({ requestdate: -1 }).limit(1000).lean()
    ]);
    const rows = issues.map((row) => ({ ...row, amount: row.fineamount }));
    res.json({
      success: true,
      cards: {
        totalbooks: books.length,
        available: books.filter((row) => /^Available$/i.test(row.status || "")).length,
        issued: issues.filter((row) => /^Issued$/i.test(row.status || "")).length,
        returned: issues.filter((row) => /^Returned$/i.test(row.status || "")).length,
        pendingrequests: requests.filter((row) => /^Requested$/i.test(row.status || "")).length,
        fine: totals(rows).fine
      },
      data: rows,
      summaries: {
        category: group(rows, "category", "count"),
        status: group(rows, "status", "count"),
        programcode: group(rows, "programcode", "count"),
        issuetype: group(rows, "issuetype", "count")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const from = dayStart(req.query.fromdate);
    const to = dayEnd(req.query.todate);
    const scoped = { colid };
    await applyLibraryAccess(scoped, colid, req.query);
    if (text(req.query.libraryid)) scoped.libraryid = text(req.query.libraryid);
    const issueQuery = { ...scoped };
    const returnQuery = { ...scoped, status: /^Returned$/i };
    const photocopyQuery = { ...scoped };
    const bookQuery = { ...scoped };
    if (from || to) {
      issueQuery.issuedate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
      returnQuery.returndate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
      photocopyQuery.requestdate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
      bookQuery.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const [booksAll, newBooks, issues, returns, requests, photocopies, users, institution, libraries] = await Promise.all([
      LibraryBook.find(scoped).sort({ createdAt: -1 }).limit(10000).lean(),
      LibraryBook.find(bookQuery).sort({ createdAt: -1 }).limit(10000).lean(),
      LibraryIssue.find(issueQuery).sort({ issuedate: -1 }).limit(10000).lean(),
      LibraryIssue.find(returnQuery).sort({ returndate: -1 }).limit(10000).lean(),
      LibraryRequest.find(scoped).sort({ requestdate: -1 }).limit(5000).lean(),
      LibraryPhotocopyRequest.find(photocopyQuery).sort({ requestdate: -1 }).limit(5000).lean(),
      User.find({ colid }).select("name email user regno role program programcode department").lean(),
      Institution.findOne({ colid }).lean(),
      accessibleLibraries(colid, req.query.user || req.query.email, /^all$/i.test(text(req.query.role)))
    ]);
    const userByReg = new Map();
    const userByEmail = new Map();
    users.forEach((user) => {
      if (text(user.regno)) userByReg.set(text(user.regno).toLowerCase(), user);
      if (text(user.email || user.user)) userByEmail.set(text(user.email || user.user).toLowerCase(), user);
    });
    const enrichedIssues = issues.map((row) => {
      const profile = userByReg.get(text(row.regno).toLowerCase()) || userByEmail.get(text(row.email).toLowerCase()) || {};
      return { ...row, usertype: text(row.role || profile.role) || "Not specified", department: text(profile.department || row.department) };
    });
    const issueRows = enrichedIssues.filter((row) => /^Issued$/i.test(row.status || ""));
    const returnedRows = enrichedIssues.filter((row) => /^Returned$/i.test(row.status || ""));
    const activeIssuedAll = booksAll.filter((book) => /^Issued$/i.test(book.status || "")).length;
    const totalFine = returns.reduce((sum, row) => sum + number(row.fineamount, 0), 0);
    const topBooksMap = new Map();
    enrichedIssues.forEach((row) => {
      const key = text(row.accessionno) || text(row.title) || "Not specified";
      const current = topBooksMap.get(key) || { accessionno: row.accessionno, title: row.title, category: row.category, count: 0 };
      current.count += 1;
      topBooksMap.set(key, current);
    });
    const dashboard = {
      success: true,
      institution,
      libraries,
      cards: {
        totalBooks: booksAll.length,
        availableBooks: booksAll.filter((row) => /^Available$/i.test(row.status || "")).length,
        activeIssued: activeIssuedAll,
        issuedInRange: issueRows.length,
        returnedInRange: returns.length || returnedRows.length,
        pendingBookRequests: requests.filter((row) => /^Requested$/i.test(row.status || "")).length,
        photocopyRequests: photocopies.length,
        pendingPhotocopy: photocopies.filter((row) => /^Requested$/i.test(row.status || "")).length,
        fineAmount: totalFine,
        newAdditions: newBooks.length
      },
      charts: {
        issueReturn: [
          { label: "Issued", count: issueRows.length },
          { label: "Returned", count: returns.length || returnedRows.length }
        ],
        categoryInterests: group(enrichedIssues, "category", "count").slice(0, 12),
        userTypeCirculation: group(enrichedIssues, "usertype", "count"),
        photocopyTrend: groupByMonth(photocopies, "requestdate"),
        categorywiseBooks: group(booksAll, "category", "count").slice(0, 15),
        newAdditionsMonthwise: groupByMonth(newBooks.length ? newBooks : booksAll, "createdAt"),
        librarywiseBooks: group(booksAll, "libraryname", "count"),
        statuswiseBooks: group(booksAll, "status", "count"),
        programwiseCirculation: group(enrichedIssues, "programcode", "count")
      },
      details: {
        issues: enrichedIssues,
        books: booksAll,
        newBooks,
        requests,
        photocopies,
        topBooks: Array.from(topBooksMap.values()).sort((a, b) => b.count - a.count).slice(0, 25)
      }
    };
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateDummyData = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const count = Math.max(1, Math.min(number(req.body.count, 50), 500));
    const userEmail = text(req.body.user);
    const existingUsers = await User.find({ colid }).select("name email user regno role phone program programcode academicyear semester section department").limit(1000).lean();
    if (!existingUsers.length) return res.status(400).json({ success: false, message: "No users found for this institution. Create users first." });
    const libraryNames = ["Central Library", "Health Sciences Library", "Digital Learning Library"];
    const libraries = [];
    for (const [index, libraryname] of libraryNames.entries()) {
      const library = await LibraryMaster.findOneAndUpdate(
        { colid, libraryname },
        { colid, libraryname, description: `${libraryname} dummy data`, type: index === 0 ? "University" : index === 1 ? "Departmental" : "Special", status: "Active", user: userEmail },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      libraries.push(library);
    }
    const categories = ["Orthodontics", "Oral Surgery", "Biochemistry", "Research Methods", "Public Health", "Prosthodontics", "Anatomy", "Periodontics"];
    const subjects = ["Clinical Dentistry", "Basic Science", "Research", "Community Care", "Lab Practice"];
    const books = [];
    for (let i = 0; i < count; i += 1) {
      const library = randomPick(libraries, i);
      const category = randomPick(categories, i);
      const title = `${category} Reference ${String(i + 1).padStart(3, "0")}`;
      const accessionno = `LIB-${String(colid).padStart(3, "0")}-${String(i + 1).padStart(5, "0")}`;
      const purchasedate = addDays(new Date(), -1 * (i % 360));
      const book = await LibraryBook.findOneAndUpdate(
        { colid, libraryid: String(library._id), accessionno },
        {
          colid,
          ...libraryPayload(library),
          accessionno,
          title,
          author: `Author ${String.fromCharCode(65 + (i % 26))}`,
          classification: `${category.slice(0, 3).toUpperCase()}-${100 + i}`,
          publisher: "Academic Press",
          publisheraddress: "Institutional Book Supplier",
          isbn: `978-81-${String(1000000 + i)}`,
          category,
          subject: randomPick(subjects, i),
          edition: `${(i % 5) + 1}`,
          publicationyear: String(2018 + (i % 9)),
          language: "English",
          rackno: `R${(i % 8) + 1}`,
          shelfno: `S${(i % 12) + 1}`,
          location: "Main Stack",
          supplier: "Demo Supplier",
          invoiceno: `INV-${String(i + 1).padStart(4, "0")}`,
          invoicedate: purchasedate,
          keywords: `${category}, learning, reference`,
          purchasedate,
          price: 500 + (i % 30) * 75,
          pages: 120 + (i % 40) * 8,
          status: "Available",
          remarks: "Generated dummy library book",
          user: userEmail
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      books.push(book);
    }
    const circulationUsers = existingUsers.filter((user) => text(user.regno) || text(user.email || user.user));
    const issueCount = Math.min(count * 2, books.length * 2);
    let createdIssues = 0;
    let createdRequests = 0;
    let createdPhotocopies = 0;
    for (let i = 0; i < issueCount; i += 1) {
      const book = randomPick(books, i);
      const profile = randomPick(circulationUsers, i + 3);
      if (!book || !profile) continue;
      const issuedate = addDays(new Date(), -1 * ((i % 150) + 1));
      const returned = i % 3 !== 0;
      const duedate = addDays(issuedate, 14 + (i % 15));
      const issuePayload = {
        colid,
        ...libraryPayload(book),
        accessionno: book.accessionno,
        bookid: String(book._id),
        title: book.title,
        author: book.author,
        classification: book.classification,
        publisher: book.publisher,
        publisheraddress: book.publisheraddress,
        invoiceno: book.invoiceno,
        invoicedate: book.invoicedate,
        keywords: book.keywords,
        category: book.category,
        ...studentPayload(profile),
        regno: text(profile.regno) || text(profile.email || profile.user),
        issuetype: randomPick(issueTypes, i),
        issuedate,
        duedate,
        returndate: returned ? addDays(issuedate, 7 + (i % 28)) : undefined,
        status: returned ? "Returned" : "Issued",
        fineamount: returned && i % 7 === 0 ? 20 + (i % 5) * 10 : 0,
        remarks: "Generated dummy circulation",
        issuedby: userEmail,
        returnedby: returned ? userEmail : "",
        user: userEmail
      };
      const existing = await LibraryIssue.findOne({ colid, accessionno: issuePayload.accessionno, regno: issuePayload.regno, issuedate });
      if (!existing) {
        await LibraryIssue.create(issuePayload);
        createdIssues += 1;
      }
      if (!returned) await LibraryBook.findOneAndUpdate({ _id: book._id, colid }, { status: "Issued" });
      if (i % 4 === 0) {
        await LibraryRequest.create({
          colid,
          ...libraryPayload(book),
          accessionno: book.accessionno,
          bookid: String(book._id),
          title: book.title,
          author: book.author,
          classification: book.classification,
          publisher: book.publisher,
          publisheraddress: book.publisheraddress,
          invoiceno: book.invoiceno,
          invoicedate: book.invoicedate,
          keywords: book.keywords,
          category: book.category,
          ...studentPayload(profile),
          regno: text(profile.regno) || text(profile.email || profile.user),
          requestdate: addDays(new Date(), -1 * (i % 90)),
          status: i % 8 === 0 ? "Issued" : "Requested",
          remarks: "Generated dummy request",
          user: userEmail
        });
        createdRequests += 1;
      }
      if (i % 5 === 0) {
        await LibraryPhotocopyRequest.create({
          colid,
          ...libraryPayload(book),
          accessionno: book.accessionno,
          bookid: String(book._id),
          title: book.title,
          author: book.author,
          classification: book.classification,
          publisher: book.publisher,
          category: book.category,
          frompage: 5 + (i % 30),
          topage: 12 + (i % 35),
          ...studentPayload(profile),
          regno: text(profile.regno) || text(profile.email || profile.user),
          requestdate: addDays(new Date(), -1 * (i % 120)),
          status: i % 10 === 0 ? "Uploaded" : "Requested",
          documentlink: i % 10 === 0 ? "https://example.com/dummy-photocopy.pdf" : "",
          remarks: "Generated dummy photocopy request",
          user: userEmail
        });
        createdPhotocopies += 1;
      }
    }
    res.json({
      success: true,
      message: "Dummy library data generated",
      summary: {
        libraries: libraries.length,
        books: books.length,
        circulation: createdIssues,
        requests: createdRequests,
        photocopyRequests: createdPhotocopies,
        usersConsidered: circulationUsers.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentIssues = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const regno = text(req.query.regno);
    const email = text(req.query.email);
    const query = { colid };
    if (regno) query.regno = regno;
    else if (email) query.email = email;
    if (text(req.query.libraryid)) query.libraryid = text(req.query.libraryid);
    const data = await LibraryIssue.find(query).sort({ issuedate: -1 }).lean();
    res.json({ success: true, data, libraries: await accessibleLibraries(colid, null, true) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function movementPayload(body, colid) {
  const book = await LibraryBook.findOne({ _id: body.bookid, colid }).lean();
  if (!book) throw new Error("Book not found");
  const toLibrary = await getLibrary(colid, body.tolibraryid);
  if (!toLibrary) throw new Error("To library is required");
  return {
    colid,
    accessionno: book.accessionno,
    bookid: String(book._id),
    title: book.title,
    author: book.author,
    classification: book.classification,
    publisher: book.publisher,
    publisheraddress: book.publisheraddress,
    invoiceno: book.invoiceno,
    invoicedate: book.invoicedate,
    keywords: book.keywords,
    category: book.category,
    fromlibraryid: book.libraryid || "",
    fromlibraryname: book.libraryname || "",
    tolibraryid: String(toLibrary._id),
    tolibraryname: toLibrary.libraryname,
    status: "Applied",
    remarks: text(body.remarks),
    requestedby: text(body.user),
    user: text(body.user)
  };
}

exports.createTransfer = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const payload = await movementPayload(req.body, colid);
    payload.transferdate = date(req.body.transferdate) || new Date();
    const data = await LibraryTransfer.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.transfers = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    const movementFields = ["accessionno", "title", "classification", "publisher", "publisheraddress", "keywords", "invoiceno", "fromlibraryname", "tolibraryname", "status"];
    applyFilters(query, req.query, movementFields);
    const data = await LibraryTransfer.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, data, options: await distinctOptions(LibraryTransfer, colid, movementFields) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveTransfer = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const status = text(req.body.status) || "Approved";
    const transfer = await LibraryTransfer.findOneAndUpdate(
      { _id: req.body.id, colid },
      { status, approvedby: text(req.body.user), approveddate: new Date(), remarks: text(req.body.remarks) },
      { new: true }
    );
    if (transfer && /^Approved$/i.test(status)) {
      await LibraryBook.findOneAndUpdate(
        { _id: transfer.bookid, colid },
        { libraryid: transfer.tolibraryid, libraryname: transfer.tolibraryname }
      );
    }
    res.json({ success: true, data: transfer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createLoan = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const payload = await movementPayload(req.body, colid);
    payload.loandate = date(req.body.loandate) || new Date();
    payload.duedate = date(req.body.duedate);
    const data = await LibraryLoan.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.loans = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    const movementFields = ["accessionno", "title", "classification", "publisher", "publisheraddress", "keywords", "invoiceno", "fromlibraryname", "tolibraryname", "status"];
    applyFilters(query, req.query, movementFields);
    const data = await LibraryLoan.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, data, options: await distinctOptions(LibraryLoan, colid, movementFields) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveLoan = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const status = text(req.body.status) || "Approved";
    const payload = { status, approvedby: text(req.body.user), approveddate: new Date(), remarks: text(req.body.remarks) };
    if (/^Returned$/i.test(status)) payload.returndate = new Date();
    const data = await LibraryLoan.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentLedger = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    if (text(req.query.regno)) query.regno = text(req.query.regno);
    else if (text(req.query.email)) query.user = text(req.query.email);
    applyFilters(query, req.query, ledgerFields);
    const data = await Ledgerstud.find(query).sort({ academicyear: -1, feegroup: 1, feeitem: 1 }).limit(3000).lean();
    const institution = await Institution.findOne({ colid }).lean();
    res.json({ success: true, data, totals: totals(data), institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentCounterReceipts = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    if (text(req.query.regno)) query.regno = text(req.query.regno);
    const data = await CounterFee2Transaction.find(query).sort({ paiddate: -1, createdAt: -1 }).limit(1000).lean();
    const institution = await Institution.findOne({ colid }).lean();
    res.json({ success: true, data, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentBalance = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid, balance: { $gt: 0 } };
    if (text(req.query.regno)) query.regno = text(req.query.regno);
    applyFilters(query, req.query, ledgerFields);
    const data = await Ledgerstud.find(query).sort({ duedate: 1, feegroup: 1, feeitem: 1 }).limit(3000).lean();
    const today = new Date();
    const rows = data.map((row) => ({ ...row, duebucket: row.duedate && new Date(row.duedate) < today ? "Past Due" : "Upcoming" }));
    res.json({ success: true, data: rows, totals: totals(rows), pastdue: rows.filter((row) => row.duebucket === "Past Due"), upcoming: rows.filter((row) => row.duebucket === "Upcoming") });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
