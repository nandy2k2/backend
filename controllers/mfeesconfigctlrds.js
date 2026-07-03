const Fees = require("../Models/fees");
const FeeBook = require("../Models/feebook");
const CashBook = require("../Models/cashbook");
const MPrograms = require("../Models/mprograms");
const RegulationMaster = require("../Models/regulationmasterds");
const RegulationSubject = require("../Models/regulationsubjectds");
const FeeApprovalRole = require("../Models/feeapprovalrole");

const academicYears = ["2026-27", "2027-28", "2028-29", "2029-30", "2030-31"];

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function text(value) {
  return String(value || "").trim();
}

function cleanPayload(input = {}) {
  return {
    name: text(input.name),
    user: text(input.user),
    colid: toNumber(input.colid),
    academicyear: text(input.academicyear) || "2026-27",
    program: text(input.program),
    programcode: text(input.programcode),
    regulation: text(input.regulation),
    major: text(input.major),
    minor: text(input.minor),
    IDC: text(input.IDC || input.idc),
    gender: text(input.gender),
    Medium: text(input.Medium || input.medium),
    feebook: text(input.feebook),
    cashbook: text(input.cashbook),
    feegroup: text(input.feegroup),
    semester: text(input.semester),
    feeeitem: text(input.feeeitem || input.feeitem),
    feecategory: text(input.feecategory),
    studtype: text(input.studtype),
    domicile: text(input.domicile),
    feetype: text(input.feetype),
    classdate: input.classdate || new Date(),
    amount: toNumber(input.amount) || 0,
    status: text(input.status) || "Added"
  };
}

function validate(payload) {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.name) return "Name is required";
  if (!payload.user) return "User is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.programcode) return "Program is required";
  if (!payload.feegroup) return "Fee group is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.feeeitem) return "Fee item is required";
  if (!payload.feecategory) return "Fee category is required";
  return "";
}

function buildQuery(source = {}) {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "programcode", "regulation", "major", "minor", "IDC", "gender", "Medium", "semester", "feebook", "cashbook", "status"].forEach((key) => {
    if (source[key]) query[key] = source[key];
  });
  return query;
}

function normalizeRole(value) {
  return String(value || "").trim();
}

async function getApprovalRoles(colid) {
  const roles = await FeeApprovalRole.find({
    colid: Number(colid),
    isactive: { $ne: "No" }
  }).sort({ level: 1, role: 1 });

  return roles.map((item) => normalizeRole(item.role)).filter(Boolean);
}

exports.getMFeesOptions = async (req, res) => {
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

    const [
      feebooks,
      cashbooks,
      programs,
      masterRegulations,
      subjectRegulations,
      majors,
      minors,
      idcs,
      feeAcademicYears,
      feeProgramRows,
      feeRegulations,
      feeMajors,
      feeMinors,
      feeIdcs,
      feeGenders,
      feeMediums,
      feeSemesters,
      feeStatuses
    ] = await Promise.all([
      FeeBook.find({ colid }).sort({ feebook: 1 }).lean(),
      CashBook.find({ colid }).sort({ cashnook: 1, cashbook: 1 }).lean(),
      MPrograms.find({ colid }).sort({ program: 1, programcode: 1 }).lean(),
      RegulationMaster.find({ colid, isactive: "Yes" }).sort({ regulation: 1 }).lean(),
      RegulationSubject.distinct("regulation", { colid, ...(academicyear ? { academicyear } : {}) }),
      RegulationSubject.find({ ...subjectQuery, type: "Major", status: "Active" }).sort({ subject: 1 }).lean(),
      RegulationSubject.find({ ...subjectQuery, type: "Minor", status: "Active" }).sort({ subject: 1 }).lean(),
      RegulationSubject.find({ ...subjectQuery, type: "IDC", status: "Active" }).sort({ subject: 1 }).lean(),
      Fees.distinct("academicyear", { colid }),
      Fees.find({ colid }).select("program programcode").sort({ program: 1, programcode: 1 }).lean(),
      Fees.distinct("regulation", { colid }),
      Fees.distinct("major", { colid }),
      Fees.distinct("minor", { colid }),
      Fees.distinct("IDC", { colid }),
      Fees.distinct("gender", { colid }),
      Fees.distinct("Medium", { colid }),
      Fees.distinct("semester", { colid }),
      Fees.distinct("status", { colid })
    ]);

    const regulationNames = Array.from(new Set([
      ...subjectRegulations.filter(Boolean),
      ...masterRegulations.map((item) => item.regulation).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      academicYears,
      feebooks: feebooks.map((item) => item.feebook).filter(Boolean),
      cashbooks: cashbooks.map((item) => item.cashbook || item.cashnook).filter(Boolean),
      programs: programs.map((item) => ({
        _id: item._id,
        program: item.program || item.name || "",
        programcode: item.programcode || "",
        year: item.year || "",
        type: item.type || ""
      })),
      regulations: regulationNames,
      majors: majors.map((item) => item.subject).filter(Boolean),
      minors: minors.map((item) => item.subject).filter(Boolean),
      idcs: idcs.map((item) => item.subject).filter(Boolean),
      feeFilterOptions: {
        academicYears: feeAcademicYears.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
        programs: Array.from(new Map(feeProgramRows
          .filter((item) => item.programcode)
          .map((item) => [item.programcode, { program: item.program || "", programcode: item.programcode || "" }])).values())
          .sort((a, b) => String(a.program || "").localeCompare(String(b.program || "")) || String(a.programcode || "").localeCompare(String(b.programcode || ""))),
        regulations: feeRegulations.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        majors: feeMajors.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        minors: feeMinors.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        idcs: feeIdcs.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        genders: feeGenders.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        mediums: feeMediums.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        semesters: feeSemesters.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
        statuses: feeStatuses.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createMFees = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });

    const data = await Fees.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMFees = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const data = await Fees.find(query).sort({ academicyear: -1, program: 1, semester: 1, feeeitem: 1 });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMFeesForApproval = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const currentRole = normalizeRole(req.query.role);
    if (!currentRole) return res.status(400).json({ success: false, message: "role is required" });

    const roles = await getApprovalRoles(colid);
    const currentIndex = roles.findIndex((role) => role.toLowerCase() === currentRole.toLowerCase());
    if (currentIndex === -1) {
      return res.json({ success: true, roles, data: [], message: "Role is not configured for fee approval" });
    }

    const ownPending = `${roles[currentIndex]}_PENDING`;
    const statusFilter = currentIndex === 0 ? ["Added", ownPending, "Active"] : [ownPending, "Active"];
    const data = await Fees.find({ colid, status: { $in: statusFilter } }).sort({ academicyear: -1, program: 1, semester: 1, feeeitem: 1 });

    res.json({ success: true, roles, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMFees = async (req, res) => {
  try {
    const id = req.body.id;
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });

    const data = await Fees.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Fee record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMFees = async (req, res) => {
  try {
    const data = await Fees.findByIdAndDelete(req.body.id);
    if (!data) return res.status(404).json({ success: false, message: "Fee record not found" });
    res.json({ success: true, message: "Fee record deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDeleteMFees = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "No fee records selected" });

    const result = await Fees.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0, message: "Selected fee records deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveMFees = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const currentRole = normalizeRole(req.body.role);
    const remarks = text(req.body.remarks);
    if (!currentRole) return res.status(400).json({ success: false, message: "role is required" });

    const fee = await Fees.findById(id);
    if (!fee) return res.status(404).json({ success: false, message: "Fee record not found" });

    const roles = await getApprovalRoles(fee.colid);
    if (!roles.length) return res.status(400).json({ success: false, message: "Fee approval roles are not configured" });

    const currentIndex = roles.findIndex((role) => role.toLowerCase() === currentRole.toLowerCase());
    if (currentIndex === -1) {
      return res.status(400).json({ success: false, message: "Role is not configured for fee approval" });
    }

    const expectedStatus = currentIndex === 0 ? "Added" : `${roles[currentIndex]}_PENDING`;
    const alternateExpectedStatus = `${roles[currentIndex]}_PENDING`;
    if (fee.status !== expectedStatus && fee.status !== alternateExpectedStatus) {
      return res.status(400).json({ success: false, message: `Fee is pending at ${fee.status}` });
    }

    const nextRole = roles[currentIndex + 1];
    const nextStatus = nextRole ? `${nextRole}_PENDING` : "Active";
    const history = Array.isArray(fee.approvalhistory) ? fee.approvalhistory : [];
    history.push({
      role: roles[currentIndex],
      action: "Approved",
      remarks,
      user: text(req.body.user),
      date: new Date(),
      fromstatus: fee.status,
      tostatus: nextStatus
    });

    const data = await Fees.findByIdAndUpdate(id, { status: nextStatus, approvalhistory: history }, { new: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectMFees = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const fee = await Fees.findById(id);
    if (!fee) return res.status(404).json({ success: false, message: "Fee record not found" });

    const history = Array.isArray(fee.approvalhistory) ? fee.approvalhistory : [];
    history.push({
      role: normalizeRole(req.body.role),
      action: "Rejected",
      remarks: text(req.body.remarks),
      user: text(req.body.user),
      date: new Date(),
      fromstatus: fee.status,
      tostatus: "Rejected"
    });

    const data = await Fees.findByIdAndUpdate(id, { status: "Rejected", approvalhistory: history }, { new: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateMFees = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    const valid = [];
    items.forEach((item, index) => {
      const payload = cleanPayload({
        ...item,
        colid: req.body.colid || item.colid,
        user: req.body.user || item.user,
        name: req.body.name || item.name,
        status: item.status || "Added"
      });
      const error = validate(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });

    if (valid.length) await Fees.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
