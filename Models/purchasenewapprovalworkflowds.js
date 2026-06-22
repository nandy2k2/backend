const mongoose = require("mongoose");

const purchaseNewApprovalWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  workflowtype: { type: String, required: true, index: true },
  level: { type: Number, required: true },
  approverrole: { type: String, required: true },
  approvername: { type: String },
  approveremail: { type: String },
  active: { type: String, default: "Yes" },
  remarks: { type: String },
  user: { type: String }
}, { timestamps: true });

purchaseNewApprovalWorkflowSchema.index({ colid: 1, workflowtype: 1, level: 1 });

module.exports = mongoose.model("purchasenewapprovalworkflowds", purchaseNewApprovalWorkflowSchema);
