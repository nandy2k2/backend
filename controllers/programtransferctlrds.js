const User = require("../Models/user");
const Fees = require("../Models/fees");
const Ledgerstud = require("../Models/ledgerstud");
const ProgramTransferLog = require("../Models/programtransferlogds");
const FeeTransferLog = require("../Models/feetransferlogds");

const studentFilterFields = ["academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section", "Major", "Minor", "IDC", "SEC", "VAC", "name", "email", "phone", "regno"];
const transferFields = ["student", "regno", "email", "oldprogramcode", "newprogramcode", "oldacademicyear", "newacademicyear", "transferdate"];
const feeTransferFields = ["student", "regno", "email", "oldprogramcode", "newprogramcode", "oldacademicyear", "newacademicyear", "refundmode", "transferdate"];

function text(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function regex(value) {
  return new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function clean(values) {
  return [...new Set((values || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function applyFilters(query, filters = [], fieldMap = {}) {
  filters.forEach((filter) => {
    const field = fieldMap[filter.field] || filter.field;
    const value = text(filter.value);
    if (!field || !value) return;
    if (["name", "student", "email", "phone", "regno"].includes(field)) query[field] = regex(value);
    else query[field] = value;
  });
}

function balanceOf(row) {
  const balance = num(row.balance);
  if (balance > 0) return balance;
  return Math.max(0, num(row.amount) - num(row.paid) - num(row.concession));
}

function snapshot(student = {}) {
  return {
    academicyear: student.academicyear || "",
    admissionyear: student.admissionyear || "",
    regulation: student.regulation || "",
    program: student.program || "",
    programcode: student.programcode || "",
    Major: student.Major || "",
    Minor: student.Minor || "",
    IDC: student.IDC || "",
    SEC: student.SEC || "",
    VAC: student.VAC || "",
    semester: student.semester || "",
    section: student.section || ""
  };
}

async function distinct(Model, field, query) {
  return clean(await Model.distinct(field, query));
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const userQuery = { colid, role: /^Student$/i };
    const feeQuery = { colid, status: /^Active$/i };
    const [
      academicyear, admissionyear, regulation, program, programcode, semester, section,
      major, minor, idc, sec, vac,
      feeYears, feeRegs, feePrograms, feeProgramcodes, feeMajors, feeMinors, feeIdcs, feeSecs, feeVacs, feeSemesters
    ] = await Promise.all([
      distinct(User, "academicyear", userQuery),
      distinct(User, "admissionyear", userQuery),
      distinct(User, "regulation", userQuery),
      distinct(User, "program", userQuery),
      distinct(User, "programcode", userQuery),
      distinct(User, "semester", userQuery),
      distinct(User, "section", userQuery),
      distinct(User, "Major", userQuery),
      distinct(User, "Minor", userQuery),
      distinct(User, "IDC", userQuery),
      distinct(User, "SEC", userQuery),
      distinct(User, "VAC", userQuery),
      distinct(Fees, "academicyear", feeQuery),
      distinct(Fees, "regulation", feeQuery),
      distinct(Fees, "program", feeQuery),
      distinct(Fees, "programcode", feeQuery),
      distinct(Fees, "major", feeQuery),
      distinct(Fees, "minor", feeQuery),
      distinct(Fees, "IDC", feeQuery),
      distinct(Fees, "SEC", feeQuery),
      distinct(Fees, "VAC", feeQuery),
      distinct(Fees, "semester", feeQuery)
    ]);
    res.json({
      success: true,
      studentOptions: { academicyear, admissionyear, regulation, program, programcode, semester, section, Major: major, Minor: minor, IDC: idc, SEC: sec, VAC: vac },
      transferOptions: {
        academicyear: clean([...academicyear, ...feeYears]),
        regulation: clean([...regulation, ...feeRegs]),
        program: clean([...program, ...feePrograms]),
        programcode: clean([...programcode, ...feeProgramcodes]),
        major: clean([...major, ...feeMajors]),
        minor: clean([...minor, ...feeMinors]),
        IDC: clean([...idc, ...feeIdcs]),
        SEC: clean([...sec, ...feeSecs]),
        VAC: clean([...vac, ...feeVacs]),
        semester: clean([...semester, ...feeSemesters]),
        section
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const query = { colid, role: /^Student$/i };
    applyFilters(query, Array.isArray(req.body.filters) ? req.body.filters : [], { major: "Major", minor: "Minor", idc: "IDC", sec: "SEC", vac: "VAC" });
    const data = await User.find(query)
      .select("name email phone regno academicyear admissionyear regulation program programcode Major Minor IDC SEC VAC semester section category gender status colid")
      .sort({ academicyear: -1, programcode: 1, name: 1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentLedger = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const student = await User.findOne({ _id: req.query.studentid, colid, role: /^Student$/i }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const query = { colid, regno: student.regno };
    const data = await Ledgerstud.find(query).sort({ academicyear: -1, feegroup: 1, feeitem: 1 }).limit(2000).lean();
    res.json({ success: true, student, data, totalpaid: data.reduce((sum, row) => sum + num(row.paid), 0), totalbalance: data.reduce((sum, row) => sum + balanceOf(row), 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.feeTemplates = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const q = { colid, status: /^Active$/i };
    ["academicyear", "regulation", "program", "programcode", "semester"].forEach((field) => {
      if (text(req.body[field])) q[field] = text(req.body[field]);
    });
    if (text(req.body.major)) q.major = { $in: [text(req.body.major), "", "All", "NA"] };
    if (text(req.body.minor)) q.minor = { $in: [text(req.body.minor), "", "All", "NA"] };
    if (text(req.body.IDC)) q.IDC = { $in: [text(req.body.IDC), "", "All", "NA"] };
    const data = await Fees.find(q)
      .select("academicyear regulation program programcode major minor IDC SEC VAC semester feegroup feeeitem feecategory feetype feebook cashbook classdate amount status colid")
      .sort({ semester: 1, feegroup: 1, feeeitem: 1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.executeTransfer = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const student = await User.findOne({ _id: req.body.studentid, colid, role: /^Student$/i });
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const newDetails = {
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      Major: text(req.body.major),
      Minor: text(req.body.minor),
      IDC: text(req.body.IDC),
      SEC: text(req.body.SEC),
      VAC: text(req.body.VAC),
      semester: text(req.body.semester),
      section: text(req.body.section)
    };
    if (!newDetails.academicyear || !newDetails.programcode || !newDetails.semester) {
      return res.status(400).json({ success: false, message: "Academic year, program code and semester are required" });
    }
    const fees = Array.isArray(req.body.fees) ? req.body.fees : [];
    if (!fees.length) return res.status(400).json({ success: false, message: "Select new fee template items" });
    const allocations = new Map(fees.map((row) => [String(row.feeid || row._id), Math.max(0, num(row.allocatedpaid))]));
    const feeIds = fees.map((row) => row.feeid || row._id).filter(Boolean);
    const feeRows = await Fees.find({ _id: { $in: feeIds }, colid }).lean();
    if (!feeRows.length) return res.status(400).json({ success: false, message: "Fee template rows not found" });

    const oldDetails = snapshot(student);
    const oldLedger = await Ledgerstud.find({ colid, regno: student.regno });
    const oldPaid = oldLedger.reduce((sum, row) => sum + num(row.paid), 0);
    const newFeeTotal = feeRows.reduce((sum, row) => sum + num(row.amount), 0);
    const allocated = feeRows.reduce((sum, row) => sum + Math.min(num(row.amount), allocations.get(String(row._id)) || 0), 0);
    if (allocated > oldPaid + 0.01) return res.status(400).json({ success: false, message: "Allocated credit cannot be more than old paid amount" });
    if (allocated > newFeeTotal + 0.01) return res.status(400).json({ success: false, message: "Allocated credit cannot be more than new fee total" });
    const excess = Math.max(0, oldPaid - allocated);
    const adminCharges = Math.max(0, num(req.body.administrativecharges));
    const refundAmount = Math.max(0, num(req.body.refundamount));
    if (refundAmount > Math.max(0, excess - adminCharges) + 0.01) {
      return res.status(400).json({ success: false, message: "Refund cannot exceed excess credit after administrative charges" });
    }

    const transferLog = await ProgramTransferLog.create({
      colid,
      studentid: String(student._id),
      student: student.name,
      regno: student.regno,
      email: student.email,
      olddetails: oldDetails,
      newdetails: newDetails,
      transferredby: text(req.body.user),
      remarks: text(req.body.remarks)
    });

    student.academicyear = newDetails.academicyear;
    student.regulation = newDetails.regulation;
    student.program = newDetails.program;
    student.programcode = newDetails.programcode;
    student.Major = newDetails.Major;
    student.Minor = newDetails.Minor;
    student.IDC = newDetails.IDC;
    student.SEC = newDetails.SEC;
    student.VAC = newDetails.VAC;
    student.semester = newDetails.semester;
    student.section = newDetails.section;
    await student.save();

    const oldLedgerItems = [];
    for (const entry of oldLedger) {
      const oldBalance = balanceOf(entry);
      oldLedgerItems.push({ id: String(entry._id), feegroup: entry.feegroup, feeitem: entry.feeitem, amount: entry.amount, paid: entry.paid, concession: entry.concession, balance: oldBalance });
      entry.concession = num(entry.concession) + oldBalance;
      entry.balance = 0;
      entry.status = "Program Transferred";
      entry.comments = `${text(entry.comments)} ${text(entry.comments) ? "|" : ""} Closed due to program transfer ${transferLog._id}`;
      entry.approvalhistory = [...(Array.isArray(entry.approvalhistory) ? entry.approvalhistory : []), { action: "Program Transfer", user: text(req.body.user), date: new Date(), transferid: String(transferLog._id), oldbalance: oldBalance }];
      await entry.save();
    }

    const newLedgerDocs = feeRows.map((fee) => {
      const paid = Math.min(num(fee.amount), allocations.get(String(fee._id)) || 0);
      const amount = num(fee.amount);
      return {
        name: text(req.body.user) || student.email,
        user: student.email || student.user || student.regno,
        feegroup: fee.feegroup || "NA",
        regno: student.regno || "NA",
        student: student.name || "NA",
        feeitem: fee.feeeitem || "NA",
        amount,
        paid,
        concession: 0,
        balance: Math.max(0, amount - paid),
        cash: 0,
        upi: 0,
        cheque: 0,
        card: 0,
        pg: 0,
        neft: 0,
        feebook: fee.feebook || "",
        feecounter: "",
        paymode: paid > 0 ? "Credit Transfer" : "",
        paydetails: paid > 0 ? `Credit from old program transfer ${transferLog._id}` : "",
        feecategory: fee.feecategory || "",
        feetype: fee.feetype || "",
        semester: fee.semester || newDetails.semester,
        cashbook: fee.cashbook || "",
        institution: student.institution || "",
        type: "positive",
        installment: "",
        comments: "New fee created during program transfer",
        academicyear: fee.academicyear || newDetails.academicyear,
        colid,
        classdate: new Date(),
        duedate: fee.classdate || new Date(),
        paiddate: paid > 0 ? new Date() : null,
        status: "Active",
        programcode: fee.programcode || newDetails.programcode,
        regulation: fee.regulation || newDetails.regulation,
        major: fee.major || newDetails.Major,
        minor: fee.minor || newDetails.Minor,
        admissionyear: student.admissionyear || ""
      };
    });
    const inserted = await Ledgerstud.insertMany(newLedgerDocs);
    const createdIds = inserted.map((row) => String(row._id));

    if (refundAmount > 0) {
      const refund = await Ledgerstud.create({
        name: text(req.body.user) || student.email,
        user: student.email || student.user || student.regno,
        feegroup: "Refund",
        regno: student.regno || "NA",
        student: student.name || "NA",
        feeitem: "Program transfer refund",
        amount: -refundAmount,
        paid: -refundAmount,
        concession: 0,
        balance: -refundAmount,
        feecategory: "Refund",
        semester: newDetails.semester,
        paymode: text(req.body.refundmode),
        paydetails: text(req.body.refundrefno),
        comments: `Refund after administrative charges ${adminCharges}`,
        academicyear: newDetails.academicyear,
        colid,
        classdate: new Date(),
        duedate: new Date(),
        paiddate: req.body.refunddate ? new Date(req.body.refunddate) : new Date(),
        status: "Refund",
        programcode: newDetails.programcode,
        regulation: newDetails.regulation,
        major: newDetails.Major,
        minor: newDetails.Minor,
        admissionyear: student.admissionyear || ""
      });
      createdIds.push(String(refund._id));
    }

    const feeLog = await FeeTransferLog.create({
      colid,
      programtransferid: String(transferLog._id),
      studentid: String(student._id),
      student: student.name,
      regno: student.regno,
      email: student.email,
      oldacademicyear: oldDetails.academicyear,
      oldprogram: oldDetails.program,
      oldprogramcode: oldDetails.programcode,
      newacademicyear: newDetails.academicyear,
      newprogram: newDetails.program,
      newprogramcode: newDetails.programcode,
      totaloldpaid: oldPaid,
      totalnewfees: newFeeTotal,
      allocatedcredit: allocated,
      administrativecharges: adminCharges,
      refundamount: refundAmount,
      refundmode: text(req.body.refundmode),
      refundrefno: text(req.body.refundrefno),
      refunddate: req.body.refunddate ? new Date(req.body.refunddate) : undefined,
      oldledgeritems: oldLedgerItems,
      newfeeitems: newLedgerDocs.map((row) => ({ feegroup: row.feegroup, feeitem: row.feeitem, amount: row.amount, paid: row.paid, balance: row.balance })),
      createdledgerids: createdIds,
      createdby: text(req.body.user),
      remarks: text(req.body.remarks)
    });

    res.json({ success: true, message: "Program transfer completed", transferLog, feeLog, createdLedger: createdIds.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.transferLogs = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const q = { colid };
    applyFilters(q, Array.isArray(req.body.filters) ? req.body.filters : [], {});
    const data = await ProgramTransferLog.find(q).sort({ transferdate: -1 }).limit(3000).lean();
    const options = {};
    for (const field of transferFields) options[field] = await distinct(ProgramTransferLog, field, { colid });
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.feeTransferLogs = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const q = { colid };
    applyFilters(q, Array.isArray(req.body.filters) ? req.body.filters : [], {});
    const data = await FeeTransferLog.find(q).sort({ transferdate: -1 }).limit(3000).lean();
    const options = {};
    for (const field of feeTransferFields) options[field] = await distinct(FeeTransferLog, field, { colid });
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
