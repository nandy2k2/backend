const mongoose = require("mongoose");

const placementNewStageStudentSchema = new mongoose.Schema(
  {
    jobid: { type: String, trim: true, index: true },
    jobtitle: { type: String, trim: true },
    jobtype: { type: String, trim: true, default: "Placement" },
    company: { type: String, trim: true },
    companyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    admissionyear: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    stageid: { type: String, trim: true },
    stagename: { type: String, trim: true },
    stagedate: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    placementstatus: { type: String, trim: true, default: "In Progress" },
    confirmeddate: { type: String, trim: true },
    offerletterlink: { type: String, trim: true },
    offerlettername: { type: String, trim: true },
    contactdetails: { type: String, trim: true },
    address: { type: String, trim: true },
    ctc: { type: Number, default: 0 },
    industry: { type: String, trim: true },
    sector: { type: String, trim: true },
    comments: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewStageStudentSchema.index({ colid: 1, jobid: 1, regno: 1, studentemail: 1 }, { unique: true });
placementNewStageStudentSchema.index({ colid: 1, placementstatus: 1, stagename: 1 });

module.exports = mongoose.models.placementnewstagestudentds || mongoose.model("placementnewstagestudentds", placementNewStageStudentSchema);
