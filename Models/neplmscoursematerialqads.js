const mongoose = require("mongoose");

const neplmsCourseMaterialQaSchema = new mongoose.Schema({
  materialid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsresourceds", index: true },
  academicyear: { type: String, trim: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  semester: { type: String, trim: true },
  course: { type: String, trim: true },
  coursecode: { type: String, trim: true },
  materialtitle: { type: String, trim: true },
  question: { type: String, trim: true },
  answer: { type: String, trim: true },
  student: { type: String, trim: true },
  studentemail: { type: String, trim: true },
  regno: { type: String, trim: true },
  faculty: { type: String, trim: true },
  facultyemail: { type: String, trim: true },
  answeredby: { type: String, trim: true },
  answeredbyemail: { type: String, trim: true },
  answeredat: { type: Date },
  status: { type: String, trim: true, default: "Open" },
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true }
}, { timestamps: true });

neplmsCourseMaterialQaSchema.index({ colid: 1, materialid: 1, createdAt: -1 });
neplmsCourseMaterialQaSchema.index({ colid: 1, coursecode: 1, academicyear: 1 });

module.exports = mongoose.model("neplmscoursematerialqads", neplmsCourseMaterialQaSchema);
