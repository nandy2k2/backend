const mongoose = require("mongoose");

const AcademicAuditResponseSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    auditid: { type: String, trim: true, required: true, index: true },
    academicyear: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    scope: { type: String, trim: true, default: "" },
    responselevel: { type: String, trim: true, default: "Department" },
    criteria: { type: String, trim: true, required: true },
    questionid: { type: String, trim: true, default: "" },
    question: { type: String, trim: true, required: true },
    data: { type: String, trim: true, default: "" },
    numericvalue: { type: Number, default: 0 },
    documentlink: { type: String, trim: true, default: "" },
    documentname: { type: String, trim: true, default: "" },
    erpimportsource: { type: String, trim: true, default: "" },
    erpimported: { type: String, trim: true, default: "No" },
    status: { type: String, trim: true, default: "Submitted" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

AcademicAuditResponseSchema.index({ colid: 1, auditid: 1, criteria: 1 });

module.exports = mongoose.models.academicauditresponseds || mongoose.model("academicauditresponseds", AcademicAuditResponseSchema);
