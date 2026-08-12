const mongoose = require("mongoose");

const conductExamCourseSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  type: { type: String, enum: ["Major", "Minor", "AEC", "SEC", "VAC", "IDC"], required: true },
  subject: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  course: { type: String, required: true, trim: true },
  coursecode: { type: String, required: true, trim: true },
  coursetype: { type: String, enum: ["Theory", "Practical", "Tutorial", "Internship", "Project", "Experiential learning"], default: "Theory" },
  deliverytype: { type: String, trim: true, default: "" },
  coursemastercode: { type: String, trim: true, default: "" },
  examdate: { type: String, trim: true },
  examslot: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamCourseSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  examcode: 1,
  programcode: 1,
  type: 1,
  subject: 1,
  semester: 1,
  coursecode: 1
}, { unique: true });

module.exports = mongoose.model("conductexamcourseds", conductExamCourseSchema);
