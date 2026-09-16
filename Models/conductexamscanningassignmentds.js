const mongoose = require("mongoose");

const conductExamScanningAssignmentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  examrollid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamrollds", required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  semester: { type: String, trim: true },
  course: { type: String, trim: true },
  coursecode: { type: String, trim: true },
  examdate: { type: String, trim: true },
  examslot: { type: String, trim: true },
  campus: { type: String, trim: true },
  building: { type: String, trim: true },
  examroom: { type: String, trim: true },
  seatno: { type: String, trim: true },
  scannername: { type: String, required: true, trim: true },
  scanneremail: { type: String, required: true, trim: true, lowercase: true },
  scannerrole: { type: String, trim: true },
  assignedby: { type: String, trim: true },
  assigneddate: { type: Date, default: Date.now },
  status: { type: String, enum: ["Pending", "Completed"], default: "Pending", index: true },
  answerbooklink: { type: String, trim: true, default: "" },
  uploadedby: { type: String, trim: true },
  uploadeddate: { type: Date },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamScanningAssignmentSchema.index({ colid: 1, examrollid: 1 }, { unique: true });
conductExamScanningAssignmentSchema.index({ colid: 1, academicyear: 1, examcode: 1, scanneremail: 1, status: 1 });

module.exports = mongoose.model("conductexamscanningassignmentds", conductExamScanningAssignmentSchema);
