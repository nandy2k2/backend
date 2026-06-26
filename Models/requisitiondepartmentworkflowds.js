const mongoose = require("mongoose");

const requisitionDepartmentWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  department: { type: String, required: true, trim: true },
  level: { type: Number, required: true },
  approverrole: { type: String, required: true, trim: true },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true },
  active: { type: String, default: "Yes", trim: true },
  remarks: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.newrequisitiondepartmentworkflowds
  || mongoose.model("newrequisitiondepartmentworkflowds", requisitionDepartmentWorkflowSchema, "newrequisitiondepartmentworkflowds");
