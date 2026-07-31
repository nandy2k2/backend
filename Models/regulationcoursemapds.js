const mongoose = require("mongoose");

const regulationCourseMapSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    subject: { type: String, trim: true, required: true },
    type: { type: String, enum: ["Major", "Minor", "AEC", "SEC", "VAC", "IDC"], required: true },
    semester: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    coursetype: { type: String, enum: ["Theory", "Practical", "Tutorial", "Internship", "Project", "Experiential learning"], default: "Theory" },
    deliverytype: { type: String, enum: ["Compulsory", "Elective"], default: "Compulsory" },
    coursemastercode: { type: String, trim: true, default: "" },
    credit: { type: Number, default: 0 },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

regulationCourseMapSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  type: 1,
  subject: 1,
  semester: 1,
  coursecode: 1
});

module.exports = mongoose.model("regulationcoursemapds", regulationCourseMapSchema);
