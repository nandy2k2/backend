const mongoose = require("mongoose");

const AdmissionEntranceMarkItemSchema = new mongoose.Schema({
  componentid: String,
  component: String,
  maxmarks: { type: Number, default: 0 },
  marks: { type: Number, default: 0 }
}, { _id: false });

const AdmissionEntranceMarksSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, index: true },
  regulation: { type: String, index: true },
  category: String,
  program: String,
  programcode: { type: String, index: true },
  applicationid: { type: String, index: true },
  applicationnumber: String,
  applicantname: String,
  applicantemail: String,
  marks: [AdmissionEntranceMarkItemSchema],
  totalmarks: { type: Number, default: 0 },
  user: String,
  username: String
}, { timestamps: true });

AdmissionEntranceMarksSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, applicationid: 1 }, { unique: true });

module.exports = mongoose.models.admissionentrancemarksds
  || mongoose.model("admissionentrancemarksds", AdmissionEntranceMarksSchema);
