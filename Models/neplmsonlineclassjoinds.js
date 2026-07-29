const mongoose = require("mongoose");

const nepLmsOnlineClassJoinSchema = new mongoose.Schema(
  {
    classid: { type: mongoose.Schema.Types.ObjectId, index: true },
    studentid: { type: mongoose.Schema.Types.ObjectId, index: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true, lowercase: true },
    regno: { type: String, trim: true },
    rollno: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    classdate: { type: String, trim: true },
    classtime: { type: String, trim: true },
    joindate: { type: String, trim: true },
    jointime: { type: String, trim: true },
    lastjoinedat: { type: Date, default: Date.now },
    joincount: { type: Number, default: 1 },
    attendanceid: { type: mongoose.Schema.Types.ObjectId },
    socketid: { type: String, trim: true },
    source: { type: String, trim: true, default: "Online Class" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsOnlineClassJoinSchema.index({ colid: 1, classid: 1, studentid: 1 }, { unique: true });

module.exports = mongoose.model("neplmsonlineclassjoinds", nepLmsOnlineClassJoinSchema);
