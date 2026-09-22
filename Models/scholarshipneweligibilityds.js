const mongoose = require("mongoose");

const scholarshipNewEligibilitySchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  runid: { type: String, trim: true, default: "" },
  academicyear: { type: String, trim: true, default: "" },
  student: { type: String, trim: true, default: "" },
  studentemail: { type: String, trim: true, default: "" },
  regno: { type: String, trim: true, required: true },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  regulation: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  section: { type: String, trim: true, default: "" },
  category: { type: String, trim: true, default: "" },
  gender: { type: String, trim: true, default: "" },
  state: { type: String, trim: true, default: "" },
  scholarshipname: { type: String, trim: true, required: true },
  scholarshiptype: { type: String, trim: true, default: "" },
  provider: { type: String, trim: true, default: "" },
  amount: { type: Number, default: 0 },
  eligibilitystatus: { type: String, trim: true, default: "Eligible" },
  matchscore: { type: Number, default: 0 },
  criteria: { type: String, default: "" },
  reason: { type: String, default: "" },
  applicationlink: { type: String, trim: true, default: "" },
  ruleids: { type: [String], default: [] },
  aiProvider: { type: String, trim: true, default: "" },
  aiModel: { type: String, trim: true, default: "" },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" }
}, { timestamps: true });

scholarshipNewEligibilitySchema.index({ colid: 1, academicyear: 1, programcode: 1 });
scholarshipNewEligibilitySchema.index({ colid: 1, regno: 1 });
scholarshipNewEligibilitySchema.index({ colid: 1, scholarshipname: 1 });

module.exports = mongoose.model("scholarshipneweligibilityds", scholarshipNewEligibilitySchema);
