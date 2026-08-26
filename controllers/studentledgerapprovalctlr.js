const Ledgerstud = require("../Models/ledgerstud");
const StudentLedgerApprovalRole = require("../Models/studentledgerapprovalrole");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function text(value) {
  return String(value || "").trim();
}

function normalizeRole(value) {
  return text(value);
}

async function getApprovalRoles(colid) {
  const roles = await StudentLedgerApprovalRole.find({
    colid: Number(colid),
    isactive: { $ne: "No" }
  }).sort({ level: 1, role: 1 });

  return roles.map((item) => normalizeRole(item.role)).filter(Boolean);
}

exports.getStudentLedgerForApproval = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const currentRole = normalizeRole(req.query.role);
    if (!currentRole) return res.status(400).json({ success: false, message: "role is required" });

    const roles = await getApprovalRoles(colid);
    const currentIndex = roles.findIndex((role) => role.toLowerCase() === currentRole.toLowerCase());
    if (currentIndex === -1) {
      return res.json({ success: true, roles, data: [], message: "Role is not configured for student ledger approval" });
    }

    const ownPending = `${roles[currentIndex]}_PENDING`;
    const statusFilter = currentIndex === 0 ? ["Added", ownPending, "Active"] : [ownPending, "Active"];
    const data = await Ledgerstud.find({ colid, status: { $in: statusFilter } })
      .sort({ academicyear: -1, student: 1, feegroup: 1, feeitem: 1 });

    res.json({ success: true, roles, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveStudentLedger = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const currentRole = normalizeRole(req.body.role);
    const remarks = text(req.body.remarks);
    if (!currentRole) return res.status(400).json({ success: false, message: "role is required" });

    const ledger = await Ledgerstud.findById(id);
    if (!ledger) return res.status(404).json({ success: false, message: "Student ledger entry not found" });

    const roles = await getApprovalRoles(ledger.colid);
    if (!roles.length) return res.status(400).json({ success: false, message: "Student ledger approval roles are not configured" });

    const currentIndex = roles.findIndex((role) => role.toLowerCase() === currentRole.toLowerCase());
    if (currentIndex === -1) {
      return res.status(400).json({ success: false, message: "Role is not configured for student ledger approval" });
    }

    const expectedStatus = currentIndex === 0 ? "Added" : `${roles[currentIndex]}_PENDING`;
    const alternateExpectedStatus = `${roles[currentIndex]}_PENDING`;
    if (ledger.status !== expectedStatus && ledger.status !== alternateExpectedStatus) {
      return res.status(400).json({ success: false, message: `Ledger entry is pending at ${ledger.status}` });
    }

    const nextRole = roles[currentIndex + 1];
    const nextStatus = nextRole ? `${nextRole}_PENDING` : "Active";
    const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
    history.push({
      role: roles[currentIndex],
      action: "Approved",
      remarks,
      user: text(req.body.user),
      date: new Date(),
      fromstatus: ledger.status,
      tostatus: nextStatus
    });

    const data = await Ledgerstud.findByIdAndUpdate(id, { status: nextStatus, approvalhistory: history }, { new: true });
    await completeApprovalTasks({
      colid: ledger.colid,
      approveremail: text(req.body.useremail || req.body.user),
      category: "Student ledger approval",
      referenceModel: "ledgerstud",
      referenceId: ledger._id,
      level: roles[currentIndex],
      comments: `Student ledger approved by ${text(req.body.name || req.body.user || roles[currentIndex])}`
    });
    if (nextRole) {
      await createApprovalTasks({
        colid: ledger.colid,
        user: ledger.user,
        createdby: ledger.name || ledger.student,
        academicyear: ledger.academicyear,
        approverrole: nextRole,
        title: `Approve student ledger: ${ledger.regno || ledger.student} ${ledger.feeitem || ledger.feegroup}`,
        category: "Student ledger approval",
        pagelink: "/studentledgerapproval",
        comments: `Ledger entry for ${ledger.student || ledger.regno || ""} is pending ${nextRole} approval.`,
        referenceModel: "ledgerstud",
        referenceId: ledger._id,
        level: nextRole
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectStudentLedger = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const ledger = await Ledgerstud.findById(id);
    if (!ledger) return res.status(404).json({ success: false, message: "Student ledger entry not found" });

    const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
    history.push({
      role: normalizeRole(req.body.role),
      action: "Rejected",
      remarks: text(req.body.remarks),
      user: text(req.body.user),
      date: new Date(),
      fromstatus: ledger.status,
      tostatus: "Rejected"
    });

    const data = await Ledgerstud.findByIdAndUpdate(id, { status: "Rejected", approvalhistory: history }, { new: true });
    await completeApprovalTasks({
      colid: ledger.colid,
      approveremail: text(req.body.useremail || req.body.user),
      category: "Student ledger approval",
      referenceModel: "ledgerstud",
      referenceId: ledger._id,
      level: normalizeRole(req.body.role),
      comments: `Student ledger rejected: ${text(req.body.remarks)}`
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
