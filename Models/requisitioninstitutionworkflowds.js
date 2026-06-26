const mongoose = require("mongoose");

const requisitionInstitutionWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  level: { type: Number, required: true },
  approverrole: { type: String, required: true, trim: true },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true },
  active: { type: String, default: "Yes", trim: true },
  remarks: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.newrequisitioninstitutionworkflowds
  || mongoose.model("newrequisitioninstitutionworkflowds", requisitionInstitutionWorkflowSchema, "newrequisitioninstitutionworkflowds");
