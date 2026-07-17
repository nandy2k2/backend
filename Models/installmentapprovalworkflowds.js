const mongoose = require("mongoose");

const installmentApprovalWorkflowSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    approvaltype: { type: String, required: true, trim: true, enum: ["Program", "Institution"], index: true },
    programcode: { type: String, trim: true, default: "All", index: true },
    level: { type: Number, required: true, default: 1 },
    approverrole: { type: String, trim: true },
    approvername: { type: String, trim: true },
    approveremail: { type: String, trim: true, lowercase: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

installmentApprovalWorkflowSchema.index({ colid: 1, approvaltype: 1, programcode: 1, level: 1 });

module.exports = mongoose.models.installmentapprovalworkflowds || mongoose.model("installmentapprovalworkflowds", installmentApprovalWorkflowSchema);
