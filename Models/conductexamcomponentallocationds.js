const mongoose = require("mongoose");

const conductExamComponentAllocationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  type: { type: String, trim: true, default: "" },
  subject: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  course: { type: String, required: true, trim: true },
  coursecode: { type: String, required: true, trim: true },
  examinername: { type: String, required: true, trim: true },
  examineremail: { type: String, required: true, trim: true },
  student: { type: String, required: true, trim: true },
  regno: { type: String, required: true, trim: true },
  email: { type: String, trim: true, default: "" },
  examrollno: { type: String, trim: true, default: "" },
  seatno: { type: String, trim: true, default: "" },
  examdate: { type: String, trim: true, default: "" },
  examslot: { type: String, trim: true, default: "" },
  startdate: { type: String, trim: true, default: "" },
  enddate: { type: String, trim: true, default: "" },
  componenttype: { type: String, enum: ["Theory", "Practical", "Viva", ""], trim: true, default: "" },
  scoretype: { type: String, enum: ["Internal", "External", ""], trim: true, default: "" },
  assessmentgroup: { type: String, trim: true, default: "" },
  assessmentgrouptype: { type: String, trim: true, default: "" },
  assessmentcomponent: { type: String, required: true, trim: true },
  maxmarks: { type: Number, default: 0 },
  credits: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "Allocated" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

conductExamComponentAllocationSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  coursecode: 1,
  regno: 1,
  componenttype: 1,
  assessmentgroup: 1,
  assessmentcomponent: 1
}, { unique: true });

module.exports = mongoose.model("conductexamcomponentallocationds", conductExamComponentAllocationSchema);
