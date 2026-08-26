const mongoose = require("mongoose");

const institutionStatuteWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true },
  level: { type: Number, required: true },
  approverrole: { type: String, trim: true },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true, required: true, index: true },
  active: { type: String, trim: true, default: "Yes" },
  comments: { type: String, trim: true }
}, { timestamps: true });

institutionStatuteWorkflowSchema.index({ colid: 1, academicyear: 1, level: 1, active: 1 });

module.exports = mongoose.models.institutionstatuteworkflowds || mongoose.model("institutionstatuteworkflowds", institutionStatuteWorkflowSchema);
