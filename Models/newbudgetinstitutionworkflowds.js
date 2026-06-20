const mongoose = require("mongoose");

const NewBudgetInstitutionWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  level: { type: Number, required: true },
  approverrole: { type: String, required: true },
  approvername: { type: String },
  approveremail: { type: String },
  accesslevel: { type: String, default: "Approve Only" },
  active: { type: String, default: "Yes" },
  remarks: { type: String },
  user: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("newbudgetinstitutionworkflowds", NewBudgetInstitutionWorkflowSchema);
