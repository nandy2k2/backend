const mongoose = require("mongoose");

const nepClassEnrollmentSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true, index: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true, index: true },
    subject: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "" },
    student: { type: String, trim: true, required: true },
    regno: { type: String, trim: true, required: true, index: true },
    studentemail: { type: String, trim: true, default: "", lowercase: true },
    phone: { type: String, trim: true, default: "" },
    section: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Applied", index: true },
    appliedby: { type: String, trim: true, default: "" },
    approvedby: { type: String, trim: true, default: "" },
    approveddate: { type: Date },
    remarks: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

nepClassEnrollmentSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1, coursecode: 1, regno: 1 }, { unique: true });

module.exports = mongoose.model("nepclassenrollmentds", nepClassEnrollmentSchema);
