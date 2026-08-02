const mongoose = require("mongoose");

const approvalHistorySchema = new mongoose.Schema({
  level: { type: Number, default: 0 },
  approvername: { type: String, trim: true, default: "" },
  approveremail: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "" },
  remarks: { type: String, trim: true, default: "" },
  actiondate: { type: Date, default: Date.now }
}, { _id: false });

const conductExamAppealRequestSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true, default: "" },
  exam: { type: String, trim: true, default: "" },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, required: true, trim: true },
  course: { type: String, trim: true, default: "" },
  coursecode: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  type: { type: String, trim: true, enum: ["Theory", "Practical", "Viva"], default: "Theory" },
  component: { type: String, trim: true, default: "" },
  student: { type: String, trim: true, default: "" },
  studentemail: { type: String, trim: true, default: "" },
  regno: { type: String, required: true, trim: true },
  fee: { type: Number, default: 0 },
  approvalstatus: { type: String, trim: true, default: "Submitted" },
  currentlevel: { type: Number, default: 1 },
  remarks: { type: String, trim: true, default: "" },
  approvalhistory: [approvalHistorySchema],
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

conductExamAppealRequestSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  regno: 1,
  type: 1,
  component: 1
}, { unique: true });

module.exports = mongoose.model("conductexamappealrequestds", conductExamAppealRequestSchema);
