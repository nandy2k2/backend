const mongoose = require("mongoose");

const placementNewInternshipProfileSchema = new mongoose.Schema(
  {
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true, index: true },
    regno: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    admissionyear: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    company: { type: String, trim: true },
    areaofexpertise: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.placementnewinternshipprofileds || mongoose.model("placementnewinternshipprofileds", placementNewInternshipProfileSchema);
