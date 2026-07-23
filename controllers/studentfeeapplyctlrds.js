const User = require("../Models/user");
const Fees = require("../Models/fees");
const Ledgerstud = require("../Models/ledgerstud");
const MPrograms = require("../Models/mprograms");
const RegulationMaster = require("../Models/regulationmasterds");
const RegulationSubject = require("../Models/regulationsubjectds");

const academicYears = ["2026-27", "2027-28", "2028-29", "2029-30", "2030-31"];

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function text(value) {
  return String(value || "").trim();
}

function regex(value) {
  return new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function optionalMatch(value) {
  const cleaned = text(value);
  return cleaned ? { $in: [cleaned, "", null] } : undefined;
}

exports.getStudentFeeApplyOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const academicyear = text(req.query.academicyear);
    const regulation = text(req.query.regulation);
    const programcode = text(req.query.programcode);

    const subjectQuery = { colid };
    if (academicyear) subjectQuery.academicyear = academicyear;
    if (regulation) subjectQuery.regulation = regulation;
    if (programcode) subjectQuery.programcode = programcode;

    const [programs, masterRegulations, subjectRegulations, majors, minors] = await Promise.all([
      MPrograms.find({ colid }).sort({ program: 1, programcode: 1 }).lean(),
      RegulationMaster.find({ colid, isactive: "Yes" }).sort({ regulation: 1 }).lean(),
      RegulationSubject.distinct("regulation", { colid, ...(academicyear ? { academicyear } : {}) }),
      RegulationSubject.find({ ...subjectQuery, type: "Major", status: "Active" }).sort({ subject: 1 }).lean(),
      RegulationSubject.find({ ...subjectQuery, type: "Minor", status: "Active" }).sort({ subject: 1 }).lean()
    ]);

    const regulations = Array.from(new Set([
      ...subjectRegulations.filter(Boolean),
      ...masterRegulations.map((item) => item.regulation).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      academicYears,
      programs: programs.map((item) => ({
        _id: item._id,
        program: item.program || item.name || "",
        programcode: item.programcode || "",
        year: item.year || "",
        type: item.type || ""
      })),
      regulations,
      majors: Array.from(new Set(majors.map((item) => item.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      minors: Array.from(new Set(minors.map((item) => item.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudentFeeApplyStudents = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid, role: /^Student$/i };
    if (req.query.academicyear) query.admissionyear = req.query.academicyear;
    if (req.query.programcode) query.programcode = req.query.programcode;
    if (req.query.regulation) query.regulation = req.query.regulation;
    if (req.query.major) query.Major = req.query.major;
    if (req.query.minor) query.Minor = req.query.minor;
    if (req.query.name) query.name = regex(req.query.name);
    if (req.query.email) query.email = regex(req.query.email);
    if (req.query.phone) query.phone = regex(req.query.phone);

    const data = await User.find(query)
      .select("name email phone regno admissionyear programcode regulation Major Minor semester section category gender colid")
      .sort({ admissionyear: -1, programcode: 1, name: 1 })
      .limit(500)
      .lean();

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentApplicableFees = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const studentId = req.query.studentid;
    if (colid === undefined) {
      return res.status(400).json({ success: false, message: "colid is required" });
    }

    let student = null;
    if (studentId) {
      student = await User.findOne({ _id: studentId, colid, role: /^Student$/i }).lean();
      if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    }

    const academicyear = text(req.query.academicyear) || text(student?.admissionyear);
    const programcode = text(req.query.programcode) || text(student?.programcode);
    const regulation = text(req.query.regulation) || text(student?.regulation);
    const major = text(req.query.major) || text(student?.Major);
    const minor = text(req.query.minor) || text(student?.Minor);

    if (!academicyear || !programcode) {
      return res.status(400).json({ success: false, message: "Academic year and program are required to load fee items" });
    }

    const query = {
      colid,
      status: "Active",
      academicyear,
      programcode
    };
    const regulationMatch = optionalMatch(regulation);
    const majorMatch = optionalMatch(major);
    const minorMatch = optionalMatch(minor);
    if (regulationMatch) query.regulation = regulationMatch;
    if (majorMatch) query.major = majorMatch;
    if (minorMatch) query.minor = minorMatch;

    const fees = await Fees.find(query)
      .select("name program programcode regulation major minor feegroup semester feeeitem academicyear feecategory feebook cashbook classdate amount refundable refundamount colid status")
      .sort({ semester: 1, feegroup: 1, feeeitem: 1 })
      .lean();
    res.json({ success: true, source: "fees", student, data: fees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyStudentFees = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const studentId = req.body.studentid;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (colid === undefined || !studentId || !items.length) {
      return res.status(400).json({ success: false, message: "colid, student and fee items are required" });
    }

    const student = await User.findOne({ _id: studentId, colid, role: /^Student$/i }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });

    const feeIds = items.map((item) => item.feeid).filter(Boolean);
    const fees = await Fees.find({ _id: { $in: feeIds }, colid, status: "Active" }).lean();
    const feeMap = new Map(fees.map((fee) => [String(fee._id), fee]));

    const entries = [];
    items.forEach((item) => {
      const fee = feeMap.get(String(item.feeid));
      if (!fee) return;
      const amount = toNumber(fee.amount) || 0;
      const concession = Math.max(0, toNumber(item.concession) || 0);
      const paid = 0;
      const balance = Math.max(0, amount - concession - paid);

      entries.push({
        name: text(req.body.name) || text(req.body.user),
        user: text(req.body.user),
        feegroup: fee.feegroup || student.programcode || "NA",
        regno: student.regno || "NA",
        student: student.name,
        feeitem: fee.feeeitem,
        amount,
        paid,
        concession,
        balance,
        refundable: fee.refundable || "No",
        refundamount: toNumber(fee.refundamount) || 0,
        refundedamount: 0,
        feebook: fee.feebook,
        feecategory: fee.feecategory,
        semester: fee.semester || student.semester,
        cashbook: fee.cashbook,
        institution: student.institution || fee.institution || "",
        type: "positive",
        installment: "",
        comments: item.comments || "Fee applied from fee configuration",
        academicyear: fee.academicyear || student.admissionyear,
        colid,
        classdate: new Date(),
        duedate: fee.classdate || new Date(),
        status: concession > 0 ? "Added" : "Active",
        programcode: fee.programcode || student.programcode,
        admissionyear: fee.academicyear || student.admissionyear,
        regulation: fee.regulation || student.regulation,
        major: fee.major || student.Major,
        minor: fee.minor || student.Minor,
        feeid: String(fee._id)
      });
    });

    if (!entries.length) {
      return res.status(400).json({ success: false, message: "No valid active fee items selected" });
    }

    const data = await Ledgerstud.insertMany(entries);
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
