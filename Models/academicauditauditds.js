const mongoose = require("mongoose");

const AcademicAuditSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    auditname: { type: String, trim: true, required: true },
    scope: { type: String, trim: true, default: "Institution" },
    department: { type: String, trim: true, default: "" },
    startdate: { type: String, trim: true, default: "" },
    enddate: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active" },
    remarks: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

AcademicAuditSchema.index({ colid: 1, academicyear: 1, auditname: 1 });

module.exports = mongoose.models.academicauditauditds || mongoose.model("academicauditauditds", AcademicAuditSchema);
