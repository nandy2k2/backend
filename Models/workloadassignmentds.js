const mongoose = require("mongoose");

const workloadAssignmentSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    type: { type: String, trim: true, required: true },
    subject: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    coursetype: { type: String, trim: true, default: "" },
    facultyname: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true, required: true },
    facultydepartment: { type: String, trim: true },
    hoursperweek: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

workloadAssignmentSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  type: 1,
  subject: 1,
  semester: 1,
  coursecode: 1,
  coursetype: 1,
  facultyemail: 1
});

module.exports = mongoose.model("workloadassignmentds", workloadAssignmentSchema);
