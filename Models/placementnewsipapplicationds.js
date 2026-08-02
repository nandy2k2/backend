const mongoose = require("mongoose");

const placementNewSipApplicationSchema = new mongoose.Schema(
  {
    jobid: { type: String, trim: true, index: true },
    jobtitle: { type: String, trim: true },
    jobtype: { type: String, trim: true, default: "SIP" },
    industry: { type: String, trim: true },
    company: { type: String, trim: true },
    companyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    academicyear: { type: String, trim: true },
    admissionyear: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    applieddate: { type: String, trim: true },
    stageid: { type: String, trim: true },
    stagename: { type: String, trim: true },
    status: { type: String, trim: true, default: "Applied" },
    selected: { type: String, trim: true, default: "No" },
    offerletterlink: { type: String, trim: true },
    offerlettername: { type: String, trim: true },
    offeruploadeddate: { type: String, trim: true },
    remarks: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewSipApplicationSchema.index({ colid: 1, jobid: 1, regno: 1, studentemail: 1 }, { unique: true });

module.exports = mongoose.models.placementnewsipapplicationds || mongoose.model("placementnewsipapplicationds", placementNewSipApplicationSchema);
