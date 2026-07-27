const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    groupid: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    groupname: { type: String, trim: true },
    studentid: { type: mongoose.Schema.Types.ObjectId },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    studentphone: { type: String, trim: true },
    regno: { type: String, trim: true },
    rollno: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    major: { type: String, trim: true },
    status: { type: String, default: "Active", trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

schema.index({ colid: 1, groupid: 1, regno: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("neplmsenrollmentgroupstudentds", schema);
