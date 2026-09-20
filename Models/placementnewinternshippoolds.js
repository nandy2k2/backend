const mongoose = require("mongoose");

const placementNewInternshipPoolSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    companyname: { type: String, trim: true, required: true },
    companyemail: { type: String, trim: true },
    companyphone: { type: String, trim: true },
    companyaddress: { type: String, trim: true },
    contactperson: { type: String, trim: true },
    contactemail: { type: String, trim: true },
    contactphone: { type: String, trim: true },
    industry: { type: String, trim: true },
    sector: { type: String, trim: true },
    title: { type: String, trim: true, required: true },
    role: { type: String, trim: true },
    description: { type: String, trim: true },
    technologies: { type: String, trim: true },
    location: { type: String, trim: true },
    mode: { type: String, trim: true },
    duration: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    stipend: { type: String, trim: true },
    openings: { type: Number, default: 0 },
    eligibility: { type: String, trim: true },
    applicationdeadline: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    name: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewInternshipPoolSchema.index({ colid: 1, academicyear: 1, programcode: 1, status: 1 });

module.exports = mongoose.models.placementnewinternshippoolds || mongoose.model("placementnewinternshippoolds", placementNewInternshipPoolSchema);
