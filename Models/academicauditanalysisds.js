const mongoose = require("mongoose");

const AcademicAuditAnalysisSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    auditid: { type: String, trim: true, required: true, index: true },
    academicyear: { type: String, trim: true, default: "" },
    scope: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    provider: { type: String, trim: true, default: "Local" },
    model: { type: String, trim: true, default: "" },
    prompt: { type: String, trim: true, default: "" },
    analysis: { type: String, trim: true, default: "" },
    recommendations: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

AcademicAuditAnalysisSchema.index({ colid: 1, auditid: 1, createdAt: -1 });

module.exports = mongoose.models.academicauditanalysisds || mongoose.model("academicauditanalysisds", AcademicAuditAnalysisSchema);
