const mongoose = require("mongoose");

const neplmsSupplementaryAttendanceWorkflowSchema = new mongoose.Schema(
  {
    category: { type: String, trim: true, required: true },
    level: { type: Number, required: true },
    approverrole: { type: String, trim: true },
    approvername: { type: String, trim: true },
    approveremail: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

neplmsSupplementaryAttendanceWorkflowSchema.index({ colid: 1, category: 1, level: 1 });

module.exports = mongoose.model("neplmssupplementaryattendanceworkflowds", neplmsSupplementaryAttendanceWorkflowSchema);
