const mongoose = require("mongoose");

const conductExamAppealMarksSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  requestid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamappealrequestds", required: true, index: true },
  allotmentid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamappealallotmentds", required: true, index: true },
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
  regno: { type: String, required: true, trim: true },
  examinername: { type: String, trim: true, default: "" },
  examineremail: { type: String, required: true, trim: true },
  maxmarks: { type: Number, default: 0 },
  revisedmarks: { type: Number, default: 0 },
  comments: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, enum: ["Draft", "Submitted"], default: "Draft" },
  submitteddate: { type: Date },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

conductExamAppealMarksSchema.index({ colid: 1, allotmentid: 1 }, { unique: true });

module.exports = mongoose.model("conductexamappealmarksds", conductExamAppealMarksSchema);
