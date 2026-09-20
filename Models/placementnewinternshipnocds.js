const mongoose = require("mongoose");

const placementNewInternshipNocSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, index: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    semester: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    companyname: { type: String, trim: true },
    contactperson: { type: String, trim: true },
    officialemail: { type: String, trim: true },
    mobile: { type: String, trim: true },
    location: { type: String, trim: true },
    title: { type: String, trim: true },
    technologies: { type: String, trim: true },
    offerletterlink: { type: String, trim: true },
    offerlettername: { type: String, trim: true },
    submissioncomment: { type: String, trim: true },
    approvalstatus: { type: String, trim: true, default: "Submitted" },
    currentlevel: { type: Number, default: 1 },
    currentapprovername: { type: String, trim: true },
    currentapproveremail: { type: String, trim: true, index: true },
    finalapprovaldate: { type: String, trim: true },
    history: [{
      level: Number,
      approvername: String,
      approveremail: String,
      action: String,
      comments: String,
      actiondate: String
    }],
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewInternshipNocSchema.index({ colid: 1, academicyear: 1, programcode: 1, approvalstatus: 1 });

module.exports = mongoose.models.placementnewinternshipnocds || mongoose.model("placementnewinternshipnocds", placementNewInternshipNocSchema);
