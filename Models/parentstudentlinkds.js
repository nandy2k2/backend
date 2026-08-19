const mongoose = require("mongoose");

const parentStudentLinkSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    parentid: { type: String, trim: true },
    parentemail: { type: String, trim: true, lowercase: true, required: true },
    parent: { type: String, trim: true },
    studentid: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, required: true },
    studentemail: { type: String, trim: true },
    photo: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

parentStudentLinkSchema.index({ colid: 1, parentemail: 1, regno: 1 }, { unique: true });
parentStudentLinkSchema.index({ colid: 1, regno: 1 });

module.exports = mongoose.models.parentstudentlinkds || mongoose.model("parentstudentlinkds", parentStudentLinkSchema);
