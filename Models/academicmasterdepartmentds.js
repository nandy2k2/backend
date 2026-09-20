const mongoose = require("mongoose");

const academicMasterDepartmentSchema = new mongoose.Schema(
  {
    faculty: { type: String, trim: true, required: true },
    institution: { type: String, trim: true, required: true },
    department: { type: String, trim: true, required: true },
    departmentcode: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

academicMasterDepartmentSchema.index({ colid: 1, faculty: 1, institution: 1, department: 1 }, { unique: true });

module.exports = mongoose.models.academicmasterdepartmentds || mongoose.model("academicmasterdepartmentds", academicMasterDepartmentSchema);
