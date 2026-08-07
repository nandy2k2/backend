const mongoose = require("mongoose");

const alumniNewJobPostSchema = new mongoose.Schema(
  {
    colid: { type: Number, index: true },
    alumniemail: { type: String, trim: true, index: true },
    alumniname: { type: String, trim: true },
    type: { type: String, trim: true, default: "Job" },
    title: { type: String, trim: true },
    company: { type: String, trim: true },
    sector: { type: String, trim: true },
    industry: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    location: { type: String, trim: true },
    description: { type: String, trim: true },
    eligibility: { type: String, trim: true },
    applylink: { type: String, trim: true },
    contactemail: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

alumniNewJobPostSchema.index({ colid: 1, type: 1, company: 1, sector: 1, city: 1, country: 1 });

module.exports = mongoose.model("alumninewjobpostds", alumniNewJobPostSchema);
