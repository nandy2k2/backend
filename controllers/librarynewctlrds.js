const mongoose = require("mongoose");
const LibraryBook = require("../Models/librarybookds");
const LibraryFine = require("../Models/libraryfinecategoryds");
const LibraryIssue = require("../Models/libraryissueds");
const LibraryRequest = require("../Models/libraryrequestds");
const LibraryMaster = require("../Models/librarymasterds");
const LibraryAccess = require("../Models/libraryaccessds");
const LibraryTransfer = require("../Models/librarytransferds");
const LibraryLoan = require("../Models/libraryloands");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");

const libraryFields = ["libraryname", "description", "type", "status"];
const bookFields = [
  "libraryid", "libraryname", "accessionno", "title", "author", "classification", "publisher", "publisheraddress",
  "isbn", "category", "subject", "edition", "publicationyear", "language", "rackno", "shelfno", "location",
  "supplier", "invoiceno", "invoicedate", "keywords", "purchasedate",
  "price", "pages", "status", "remarks"
];
const studentFields = ["academicyear", "program", "programcode", "semester", "section", "name", "email", "phone", "regno", "major", "minor"];
const issueFields = ["libraryid", "libraryname", "accessionno", "title", "classification", "publisher", "publisheraddress", "category", "keywords", "invoiceno", "student", "regno", "email", "programcode", "academicyear", "semester", "issuetype", "status"];
const ledgerFields = ["academicyear", "program", "programcode", "regulation", "semester", "student", "regno", "feegroup", "feeitem", "status"];
const userFields = ["name", "email", "user", "role", "department", "phone"];

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
    phone: student.phone || "",
    program: student.program || "",
    programcode: student.programcode || "",
    academicyear: student.academicyear || student.admissionyear || "",
    semester: student.semester || "",
    section: student.section || ""
  };
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
