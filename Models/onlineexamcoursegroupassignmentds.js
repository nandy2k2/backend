const mongoose = require("mongoose");

const onlineExamCourseGroupAssignmentSchema = new mongoose.Schema(
  {
    examid: { type: mongoose.Schema.Types.ObjectId, ref: "onlineexamds", index: true },
    examname: { type: String, trim: true },
    examcode: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    groupname: { type: String, trim: true },
    facultyname: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    remarks: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

onlineExamCourseGroupAssignmentSchema.index({
  colid: 1,
  examid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  facultyemail: 1,
  groupname: 1
}, { unique: true });

module.exports = mongoose.models.onlineexamcoursegroupassignmentds
  || mongoose.model("onlineexamcoursegroupassignmentds", onlineExamCourseGroupAssignmentSchema);
