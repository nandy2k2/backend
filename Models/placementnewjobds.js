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
    semester: [{ type: String, trim: true }],
    minimumcgpa: { type: Number, default: 0 },
    salary: { type: Number, default: 0 },
    bondrequired: { type: String, trim: true, enum: ["Yes", "No"], default: "No" },
    joiningdate: { type: String, trim: true },
    termsandconditions: { type: String, trim: true },
    interntohire: { type: String, trim: true, enum: ["Yes", "No"], default: "No" },
    internshipsalary: { type: Number, default: 0 },
    eligibilitycriteria: { type: String, trim: true },
    cgpachecking: [{ type: String, trim: true }],
    atktno: { type: Number, default: 0 },
    skills: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewJobSchema.index({ colid: 1, type: 1, status: 1, company: 1 });

module.exports = mongoose.models.placementnewjobds || mongoose.model("placementnewjobds", placementNewJobSchema);
