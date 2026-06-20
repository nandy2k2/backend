const User = require("../Models/user");
const Fees = require("../Models/fees");
const Ledgerstud = require("../Models/ledgerstud");

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

function normalizeStudentFilterField(field) {
  const map = {
    academicYear: "academicyear",
    idc: "IDC",
    major: "Major",
    minor: "Minor"
  };
  return map[field] || field;
}

function buildStudentQuery(colid, filters = []) {
  const query = { colid, role: /^Student$/i };
  filters.forEach((filter) => {
    const field = normalizeStudentFilterField(filter.field);
    const value = text(filter.value);
    if (!field || !value) return;
    if (["name", "email", "phone"].includes(field)) query[field] = regex(value);
    else if (field === "academicyear") query.$or = [{ academicyear: value }, { admissionyear: value }];
    else query[field] = value;
  });
  return query;
}

function normalizeFeeFilterField(field) {
  const map = {
    academicYear: "academicyear",
    feeitem: "feeeitem",
    fmajor: "major",
    idc: "IDC"
  };
  return map[field] || field;
}

function buildFeeQuery(colid, filters = []) {
  const query = { colid };
  filters.forEach((filter) => {
    const field = normalizeFeeFilterField(filter.field);
    const value = text(filter.value);
    if (!field || !value) return;
    query[field] = value;
  });
  return query;
}

async function distinctSorted(Model, field, query) {
  const values = await Model.distinct(field, query);
  return values.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
}

exports.getFeeApplicationOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const studentQuery = { colid, role: /^Student$/i };
    const feeQuery = { colid };

    const [
      userAcademicYears,
      userAdmissionYears,
      userRegulations,
      userPrograms,
      userProgramcodes,
      departments,
      majors,
      minors,
      idcs,
      feeAcademicYears,
      feeRegulations,
      feePrograms,
      feeProgramcodes,
      feeMajors,
      feeMinors,
      feeIdcs,
      genders,
      semesters,
      feeGroups,
      feeItems,
      feeCategories,
      feeTypes,
      feeStatuses
    ] = await Promise.all([
      distinctSorted(User, "academicyear", studentQuery),
      distinctSorted(User, "admissionyear", studentQuery),
      distinctSorted(User, "regulation", studentQuery),
      distinctSorted(User, "program", studentQuery),
      distinctSorted(User, "programcode", studentQuery),
      distinctSorted(User, "department", studentQuery),
      distinctSorted(User, "Major", studentQuery),
      distinctSorted(User, "Minor", studentQuery),
      distinctSorted(User, "IDC", studentQuery),
      distinctSorted(Fees, "academicyear", feeQuery),
      distinctSorted(Fees, "regulation", feeQuery),
      distinctSorted(Fees, "program", feeQuery),
      distinctSorted(Fees, "programcode", feeQuery),
      distinctSorted(Fees, "major", feeQuery),
      distinctSorted(Fees, "minor", feeQuery),
      distinctSorted(Fees, "IDC", feeQuery),
      distinctSorted(Fees, "gender", feeQuery),
      distinctSorted(Fees, "semester", feeQuery),
      distinctSorted(Fees, "feegroup", feeQuery),
      distinctSorted(Fees, "feeeitem", feeQuery),
      distinctSorted(Fees, "feecategory", feeQuery),
      distinctSorted(Fees, "feetype", feeQuery),
      distinctSorted(Fees, "status", feeQuery)
    ]);

    res.json({
      success: true,
      studentOptions: {
        academicyear: Array.from(new Set([...userAcademicYears, ...userAdmissionYears])).sort(),
        regulation: userRegulations,
        program: userPrograms,
        programcode: userProgramcodes,
        department: departments,
        major: majors,
        minor: minors,
        IDC: idcs
      },
      feeOptions: {
        academicyear: feeAcademicYears,
        regulation: feeRegulations,
        program: feePrograms,
        programcode: feeProgramcodes,
        major: feeMajors,
        minor: feeMinors,
        IDC: feeIdcs,
        gender: genders,
        semester: semesters,
        feegroup: feeGroups,
        feeeitem: feeItems,
        feecategory: feeCategories,
        feetype: feeTypes,
        status: feeStatuses
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchFeeApplicationStudents = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = buildStudentQuery(colid, Array.isArray(req.body.filters) ? req.body.filters : []);
    const data = await User.find(query)
      .select("name email phone regno academicyear admissionyear program programcode department regulation Major Minor IDC semester section category gender colid")
      .sort({ academicyear: -1, admissionyear: -1, programcode: 1, name: 1 })
      .limit(1000)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchFeeApplicationFees = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = buildFeeQuery(colid, Array.isArray(req.body.filters) ? req.body.filters : []);
    const data = await Fees.find(query)
      .select("program programcode regulation major minor IDC gender feegroup semester feeeitem academicyear feecategory feetype feebook cashbook classdate amount colid status")
      .sort({ academicyear: -1, programcode: 1, semester: 1, feegroup: 1, feeeitem: 1 })
      .limit(1000)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyFeesToStudents = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.filter(Boolean) : [];
    const feeItems = Array.isArray(req.body.feeItems) ? req.body.feeItems : [];
    if (colid === undefined || !studentIds.length || !feeItems.length) {
      return res.status(400).json({ success: false, message: "Select at least one student and one fee item" });
    }

    const feeIds = feeItems.map((item) => item.feeid).filter(Boolean);
    const [students, fees] = await Promise.all([
      User.find({ _id: { $in: studentIds }, colid, role: /^Student$/i }).lean(),
      Fees.find({ _id: { $in: feeIds }, colid }).lean()
    ]);

    const feeMap = new Map(fees.map((fee) => [String(fee._id), fee]));
    const concessionMap = new Map(feeItems.map((item) => [String(item.feeid), Math.max(0, toNumber(item.concession) || 0)]));
    const entries = [];

    students.forEach((student) => {
      feeIds.forEach((feeid) => {
        const fee = feeMap.get(String(feeid));
        if (!fee) return;
        const amount = toNumber(fee.amount) || 0;
        const concession = concessionMap.get(String(feeid)) || 0;
        const paid = 0;
        const balance = Math.max(0, amount - concession - paid);
        entries.push({
          name: text(req.body.name) || text(req.body.user),
          user: text(req.body.user),
          feegroup: fee.feegroup || "NA",
          regno: student.regno || "NA",
          student: student.name || "NA",
          feeitem: fee.feeeitem || "NA",
          amount,
          paid,
          concession,
          balance,
          cash: 0,
          upi: 0,
          cheque: 0,
          card: 0,
          pg: 0,
          neft: 0,
          feebook: fee.feebook || "",
          feecounter: "",
          paymode: "",
          paydetails: "",
          feecategory: fee.feecategory || student.category || "",
          feetype: fee.feetype || "",
          semester: fee.semester || student.semester || "",
          cashbook: fee.cashbook || "",
          institution: student.institution || "",
          type: "positive",
          installment: "",
          comments: "Fee application bulk entry",
          academicyear: fee.academicyear || student.academicyear || student.admissionyear || "",
          colid,
          classdate: new Date(),
          duedate: fee.classdate || new Date(),
          status: concession > 0 ? "Added" : "Active",
          programcode: fee.programcode || student.programcode || "",
          admissionyear: student.admissionyear || fee.academicyear || "",
          regulation: fee.regulation || student.regulation || "",
          major: fee.major || student.Major || "",
          minor: fee.minor || student.Minor || "",
          feeid: String(fee._id)
        });
      });
    });

    if (!entries.length) return res.status(400).json({ success: false, message: "No ledger entries could be created" });

    const data = await Ledgerstud.insertMany(entries, { ordered: false });
    res.json({
      success: true,
      inserted: data.length,
      students: students.length,
      fees: fees.length,
      message: `${data.length} ledger item(s) created for ${students.length} student(s)`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
