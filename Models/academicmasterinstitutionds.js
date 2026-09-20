const mongoose = require("mongoose");

const academicMasterInstitutionSchema = new mongoose.Schema(
  {
    institution: { type: String, trim: true, required: true },
    institutioncode: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

academicMasterInstitutionSchema.index({ colid: 1, institution: 1 }, { unique: true });

module.exports = mongoose.models.academicmasterinstitutionds || mongoose.model("academicmasterinstitutionds", academicMasterInstitutionSchema);
