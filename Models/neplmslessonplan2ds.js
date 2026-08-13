const mongoose = require("mongoose");

const nepLmsLessonPlan2Schema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    module: { type: String, trim: true, required: true },
    topic: { type: String, trim: true, required: true },
    lectureno: { type: Number, default: 0 },
    planneddatefrom: { type: String, trim: true },
    planneddateto: { type: String, trim: true },
    actualdatefrom: { type: String, trim: true },
    actualdateto: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    name: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsLessonPlan2Schema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  module: 1,
  lectureno: 1
});

module.exports = mongoose.model("neplmslessonplan2ds", nepLmsLessonPlan2Schema);
