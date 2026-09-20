const mongoose = require("mongoose");

const placementNewInternshipApplicationSchema = new mongoose.Schema(
  {
    poolid: { type: String, trim: true, index: true },
    academicyear: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    companyname: { type: String, trim: true },
    companyemail: { type: String, trim: true },
    title: { type: String, trim: true },
    role: { type: String, trim: true },
    location: { type: String, trim: true },
    duration: { type: String, trim: true },
    stipend: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    applieddate: { type: String, trim: true },
    status: { type: String, trim: true, default: "Submitted" },
    approvalstatus: { type: String, trim: true, default: "Pending" },
    selected: { type: String, trim: true, default: "No" },
    coordinatorcomment: { type: String, trim: true },
    approvedby: { type: String, trim: true },
    approvedbyemail: { type: String, trim: true },
    approvaldate: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewInternshipApplicationSchema.index({ colid: 1, poolid: 1, regno: 1, studentemail: 1 }, { unique: true });

module.exports = mongoose.models.placementnewinternshipapplicationds || mongoose.model("placementnewinternshipapplicationds", placementNewInternshipApplicationSchema);
