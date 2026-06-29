const mongoose = require('mongoose');

const userProfileApprovalWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, required: true, trim: true },
  requesttype: { type: String, default: 'All', trim: true },
  level: { type: Number, required: true },
  approverrole: { type: String, trim: true },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true },
  status: { type: String, default: 'Active', trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

userProfileApprovalWorkflowSchema.index({ colid: 1, role: 1, requesttype: 1, level: 1 });

module.exports = mongoose.model('userprofileapprovalworkflowds', userProfileApprovalWorkflowSchema);
