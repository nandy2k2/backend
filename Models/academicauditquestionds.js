const mongoose = require("mongoose");

const AcademicAuditQuestionSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    criteria: { type: String, trim: true, required: true },
    question: { type: String, trim: true, required: true },
    questionorder: { type: Number, default: 0 },
    erpsource: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

AcademicAuditQuestionSchema.index({ colid: 1, criteria: 1, question: 1 });

module.exports = mongoose.models.academicauditquestionds || mongoose.model("academicauditquestionds", AcademicAuditQuestionSchema);
