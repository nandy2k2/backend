const mongoose = require("mongoose");

const programwiseMarksheetConfigurationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  programnamedisplay: { type: String, enum: ["Full", "abbreviation", "programcode"], default: "Full" },
  course: { type: String, enum: ["Yes", "No"], default: "Yes" },
  coursecode: { type: String, enum: ["Yes", "No"], default: "Yes" },
  internal: { type: String, enum: ["Yes", "No"], default: "Yes" },
  external: { type: String, enum: ["Yes", "No"], default: "Yes" },
  total: { type: String, enum: ["Yes", "No"], default: "Yes" },
  grade: { type: String, enum: ["Yes", "No"], default: "Yes" },
  credits: { type: String, enum: ["Yes", "No"], default: "Yes" },
  backlogindicator: { type: String, enum: ["Yes", "No"], default: "Yes" },
  attendance: { type: String, enum: ["Yes", "No"], default: "No" },
  signature: { type: String, enum: ["Yes", "No"], default: "Yes" },
  qrcodeposition: { type: String, enum: ["topright", "bottomright", "bottomcenter"], default: "bottomright" },
  watermark: { type: String, enum: ["Original", "Duplicate", "Provisional"], default: "Original" },
  language: { type: String, default: "English", trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

programwiseMarksheetConfigurationSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1 }, { unique: true });

module.exports = mongoose.model("programwisemarksheetconfigurationds", programwiseMarksheetConfigurationSchema);
