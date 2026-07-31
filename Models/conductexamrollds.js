const mongoose = require("mongoose");

const conductExamRollSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, required: true, trim: true },
  type: { type: String, enum: ["Major", "Minor"], required: true },
  subject: { type: String, trim: true },
  semester: { type: String, required: true, trim: true },
  course: { type: String, required: true, trim: true },
  coursecode: { type: String, required: true, trim: true },
  student: { type: String, required: true, trim: true },
  regno: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  section: { type: String, trim: true },
  examsection: { type: String, trim: true },
  applied: { type: String, enum: ["Yes", "No"], default: "Yes" },
  admitcardeligible: { type: String, enum: ["Yes", "No"], default: "Yes" },
  attended: { type: String, enum: ["Yes", "No"], default: "No" },
  attendance: { type: String, default: "" },
  fees: { type: String, default: "" },
  disciplinary: { type: String, default: "" },
  noofbacklogs: { type: Number, default: 0 },
  atkt: { type: String, default: "" },
  remarks: { type: String, trim: true },
  examdate: { type: String, trim: true },
  examslot: { type: String, trim: true },
  campus: { type: String, trim: true },
  building: { type: String, trim: true },
  examroom: { type: String, trim: true },
  seatno: { type: String, trim: true },
  examseatno: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamRollSchema.pre("save", function setExamSeatNo(next) {
  if (!this.examseatno && this._id) this.examseatno = String(this._id);
  next();
});

conductExamRollSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  examcode: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  regno: 1
}, { unique: true });

module.exports = mongoose.model("conductexamrollds", conductExamRollSchema);
