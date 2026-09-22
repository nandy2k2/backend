const mongoose = require("mongoose");

const scholarshipNewRuleSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, trim: true, default: "" },
  title: { type: String, trim: true, required: true },
  description: { type: String, trim: true, default: "" },
  ruletext: { type: String, default: "" },
  extractedtext: { type: String, default: "" },
  source: { type: String, trim: true, default: "Text" },
  filename: { type: String, trim: true, default: "" },
  filelink: { type: String, trim: true, default: "" },
  key: { type: String, trim: true, default: "" },
  bucket: { type: String, trim: true, default: "" },
  region: { type: String, trim: true, default: "" },
  mimetype: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" }
}, { timestamps: true });

scholarshipNewRuleSchema.index({ colid: 1, academicyear: 1, status: 1 });

module.exports = mongoose.model("scholarshipnewruleds", scholarshipNewRuleSchema);
