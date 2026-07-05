const mongoose = require("mongoose");

const casNewWorkflowSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, default: "All", index: true },
    department: { type: String, trim: true, default: "All", index: true },
    level: { type: Number, required: true },
    approverrole: { type: String, trim: true, default: "" },
    approvername: { type: String, trim: true, default: "" },
    approveremail: { type: String, trim: true, default: "", lowercase: true },
    actiontype: { type: String, trim: true, default: "Approve" },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

casNewWorkflowSchema.index({ colid: 1, academicyear: 1, department: 1, level: 1 });
casNewWorkflowSchema.index({ colid: 1, approveremail: 1, approverrole: 1, status: 1 });

module.exports = mongoose.model("casnewworkflowds", casNewWorkflowSchema);
