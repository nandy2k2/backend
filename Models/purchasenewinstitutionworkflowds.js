const mongoose = require("mongoose");

const purchaseNewInstitutionWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  level: { type: Number, required: true },
  approverrole: { type: String, required: true },
  approvername: { type: String },
  approveremail: { type: String },
  active: { type: String, default: "Yes" },
  remarks: { type: String },
  user: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("purchasenewinstitutionworkflowds", purchaseNewInstitutionWorkflowSchema);
