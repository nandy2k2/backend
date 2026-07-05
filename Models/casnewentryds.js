const mongoose = require("mongoose");

const casNewApprovalSchema = new mongoose.Schema(
  {
    level: { type: Number, default: 1 },
    approverrole: { type: String, trim: true, default: "" },
    approvername: { type: String, trim: true, default: "" },
    approveremail: { type: String, trim: true, default: "" },
    action: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },
    actiondate: { type: Date }
  },
  { _id: false }
);

const casNewEntrySchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    facultyname: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true, required: true, lowercase: true, index: true },
    department: { type: String, trim: true, default: "" },
    designation: { type: String, trim: true, default: "" },
    section: { type: String, trim: true, required: true },
    group: { type: String, trim: true, required: true },
    item: { type: String, trim: true, required: true },
    activitytype: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    date: { type: String, trim: true, default: "" },
    fromdate: { type: String, trim: true, default: "" },
    todate: { type: String, trim: true, default: "" },
    quantity: { type: Number, default: 1 },
    scoreperunit: { type: Number, default: 0 },
    maxscore: { type: Number, default: 0 },
    scoreclaimed: { type: Number, default: 0 },
    scoreapproved: { type: Number, default: 0 },
    evidence: { type: String, trim: true, default: "" },
    source: { type: String, trim: true, default: "Manual" },
    sourcemodel: { type: String, trim: true, default: "" },
    sourceref: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Pending Approval" },
    approvalstatus: { type: String, trim: true, default: "Pending" },
    currentlevel: { type: Number, default: 1 },
    workflowcomplete: { type: String, trim: true, default: "No" },
    submittedat: { type: Date },
    approvals: { type: [casNewApprovalSchema], default: [] },
    remarks: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

casNewEntrySchema.index({ colid: 1, academicyear: 1, facultyemail: 1, section: 1, group: 1 });
casNewEntrySchema.index({ colid: 1, academicyear: 1, facultyemail: 1, source: 1, sourcemodel: 1, sourceref: 1 });
casNewEntrySchema.index({ colid: 1, approvalstatus: 1, currentlevel: 1, department: 1, academicyear: 1 });

module.exports = mongoose.model("casnewentryds", casNewEntrySchema);
