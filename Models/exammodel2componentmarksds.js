const mongoose = require("mongoose");

const examModel2ComponentMarksSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  exam: { type: String, trim: true, default: "" },
  examcode: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  course: { type: String, trim: true, default: "" },
  coursecode: { type: String, required: true, trim: true },
  student: { type: String, trim: true, default: "" },
  regno: { type: String, required: true, trim: true },
  examrollno: { type: String, trim: true, default: "" },
  componenttype: { type: String, enum: ["Theory", "Practical", "Viva", ""], trim: true, default: "" },
  scoretype: { type: String, enum: ["Internal", "External", ""], trim: true, default: "" },
  assessmentgroup: { type: String, trim: true, default: "" },
  assessmentgrouptype: { type: String, trim: true, default: "" },
  assessmentcomponent: { type: String, required: true, trim: true },
  maxmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  credits: { type: Number, default: 0 },
  examinername: { type: String, trim: true, default: "" },
  examineremail: { type: String, trim: true, default: "" },
  submissionstatus: { type: String, enum: ["Draft", "Submitted"], trim: true, default: "Draft" },
  submitteddate: { type: String, trim: true, default: "" },
  submittedby: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

examModel2ComponentMarksSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  regulation: 1,
  programcode: 1,
  coursecode: 1,
  regno: 1,
  componenttype: 1,
  assessmentgroup: 1,
  assessmentcomponent: 1
}, { unique: true });

module.exports = mongoose.model("exammodel2componentmarksds", examModel2ComponentMarksSchema);
