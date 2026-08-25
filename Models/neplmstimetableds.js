const mongoose = require("mongoose");

const nepLmsTimetableSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    campus: { type: String, trim: true },
    building: { type: String, trim: true },
    floor: { type: String, trim: true },
    roomid: { type: String, trim: true },
    roomno: { type: String, trim: true },
    major: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    classgroup: { type: String, trim: true },
    enrollmentgroup: { type: String, trim: true },
    enrollmentgroupid: { type: mongoose.Schema.Types.ObjectId },
    specialization: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    coursegroup: { type: String, trim: true },
    classdate: { type: String, trim: true },
    classtime: { type: String, trim: true },
    period: { type: String, trim: true },
    durationminutes: { type: Number, default: 0 },
    module: { type: String, trim: true },
    topic: { type: String, trim: true },
    lecturetype: { type: String, trim: true, default: "Theory" },
    workcompleted: { type: String, trim: true, default: "" },
    onlineenabled: { type: String, trim: true, default: "No" },
    onlineclassstatus: { type: String, trim: true, default: "Scheduled" },
    onlineclassstartedat: { type: Date },
    onlineclassendedat: { type: Date },
    onlineclasslink: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsTimetableSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, coursegroup: 1, classdate: 1 });

module.exports = mongoose.model("neplmstimetableds", nepLmsTimetableSchema);
