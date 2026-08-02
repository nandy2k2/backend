const mongoose = require("mongoose");

const conductExamAppealWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, required: true, trim: true },
  level: { type: Number, required: true },
  role: { type: String, trim: true, default: "" },
  approvername: { type: String, trim: true, default: "" },
  approveremail: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

conductExamAppealWorkflowSchema.index({ colid: 1, academicyear: 1, programcode: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("conductexamappealworkflowds", conductExamAppealWorkflowSchema);
