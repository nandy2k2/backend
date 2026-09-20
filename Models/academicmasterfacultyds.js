const mongoose = require("mongoose");

const academicMasterFacultySchema = new mongoose.Schema(
  {
    faculty: { type: String, trim: true, required: true },
    facultycode: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

academicMasterFacultySchema.index({ colid: 1, faculty: 1 }, { unique: true });

module.exports = mongoose.models.academicmasterfacultyds || mongoose.model("academicmasterfacultyds", academicMasterFacultySchema);
