const mongoose = require("mongoose");

const placementNewJobSchema = new mongoose.Schema(
  {
    industry: { type: String, trim: true },
    company: { type: String, trim: true, required: true },
    companyemail: { type: String, trim: true },
    type: { type: String, trim: true, enum: ["SIP", "Placement"], default: "SIP" },
    jobtitle: { type: String, trim: true },
    jobdetails: { type: String, trim: true },
    description: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    programs: [{ program: String, programcode: String }],
    minimumcgpa: { type: Number, default: 0 },
    skills: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewJobSchema.index({ colid: 1, type: 1, status: 1, company: 1 });

module.exports = mongoose.models.placementnewjobds || mongoose.model("placementnewjobds", placementNewJobSchema);
