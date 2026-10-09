const mongoose = require("mongoose");

const internalMarksApprovalWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, trim: true, default: "" },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  course: { type: String, trim: true, default: "" },
  coursecode: { type: String, trim: true, default: "" },
  componenttype: { type: String, trim: true, default: "" },
  assessmentcomponent: { type: String, trim: true, default: "" },
  level: { type: Number, required: true, default: 1 },
  approvername: { type: String, trim: true, default: "" },
  approveremail: { type: String, trim: true, required: true, index: true },
  active: { type: String, enum: ["Yes", "No"], trim: true, default: "Yes" },
  remarks: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

internalMarksApprovalWorkflowSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  componenttype: 1,
  assessmentcomponent: 1,
  level: 1,
  approveremail: 1
}, { unique: true });

module.exports = mongoose.model("internalmarksapprovalworkflowds", internalMarksApprovalWorkflowSchema);
