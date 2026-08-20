const mongoose = require("mongoose");

const AdmissionEntranceComponentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, index: true },
  regulation: { type: String, index: true },
  program: String,
  programcode: { type: String, index: true },
  component: { type: String, required: true },
  maxmarks: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  status: { type: String, default: "Active" },
  user: String,
  username: String
}, { timestamps: true });

AdmissionEntranceComponentSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, component: 1 });

module.exports = mongoose.models.admissionentrancecomponentds
  || mongoose.model("admissionentrancecomponentds", AdmissionEntranceComponentSchema);
