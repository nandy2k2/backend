const mongoose = require("mongoose");

const institutionAffiliationWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true },
  level: { type: Number, required: true },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true, required: true, index: true },
  active: { type: String, trim: true, default: "Yes" },
  comments: { type: String, trim: true }
}, { timestamps: true });

institutionAffiliationWorkflowSchema.index({ colid: 1, academicyear: 1, level: 1, active: 1 });

module.exports = mongoose.models.institutionaffiliationworkflowds || mongoose.model("institutionaffiliationworkflowds", institutionAffiliationWorkflowSchema);
