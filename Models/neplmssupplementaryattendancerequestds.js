const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    studentid: { type: mongoose.Schema.Types.ObjectId },
    student: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    regno: { type: String, trim: true },
    rollno: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    major: { type: String, trim: true },
    category: { type: String, trim: true },
    gender: { type: String, trim: true }
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    level: { type: Number },
    action: { type: String, trim: true },
    comments: { type: String, trim: true },
    approvername: { type: String, trim: true },
    approveremail: { type: String, trim: true },
    approverrole: { type: String, trim: true },
    actionat: { type: Date, default: Date.now }
  },
  { _id: false }
);

const neplmsSupplementaryAttendanceRequestSchema = new mongoose.Schema(
  {
    category: { type: String, trim: true, required: true },
    fromdate: { type: String, trim: true, required: true },
    fromtime: { type: String, trim: true },
    todate: { type: String, trim: true, required: true },
    totime: { type: String, trim: true },
    description: { type: String, trim: true },
    documentlink: { type: String, trim: true },
    documentname: { type: String, trim: true },
    students: [studentSchema],
    status: { type: String, trim: true, default: "Draft" },
    currentlevel: { type: Number, default: 0 },
    convertedcount: { type: Number, default: 0 },
    history: [historySchema],
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    username: { type: String, trim: true }
  },
  { timestamps: true }
);

neplmsSupplementaryAttendanceRequestSchema.index({ colid: 1, category: 1, status: 1, currentlevel: 1 });

module.exports = mongoose.model("neplmssupplementaryattendancerequestds", neplmsSupplementaryAttendanceRequestSchema);
