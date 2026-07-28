const mongoose = require("mongoose");

const placementNewSipStudentSchema = new mongoose.Schema(
  {
    jobid: { type: String, trim: true, index: true },
    jobtitle: { type: String, trim: true },
    type: { type: String, trim: true, default: "SIP" },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    admissionyear: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    company: { type: String, trim: true },
    companyemail: { type: String, trim: true },
    project: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    companycontact: { type: String, trim: true },
    mentor: { type: String, trim: true },
    mentoremail: { type: String, trim: true },
    status: { type: String, trim: true, default: "Assigned" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewSipStudentSchema.index({ colid: 1, jobid: 1, regno: 1 }, { unique: true });

module.exports = mongoose.models.placementnewsipstudentds || mongoose.model("placementnewsipstudentds", placementNewSipStudentSchema);
