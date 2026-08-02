const mongoose = require("mongoose");

const conductExamAppealAllotmentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  requestid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamappealrequestds", required: true, index: true },
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
  examinername: { type: String, required: true, trim: true },
  examineremail: { type: String, required: true, trim: true },
  status: { type: String, trim: true, default: "Allotted" },
  remarks: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

conductExamAppealAllotmentSchema.index({ colid: 1, requestid: 1, examineremail: 1 }, { unique: true });

module.exports = mongoose.model("conductexamappealallotmentds", conductExamAppealAllotmentSchema);
