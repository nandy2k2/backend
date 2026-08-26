const mongoose = require("mongoose");

const institutionRuleSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  type: { type: String, trim: true, enum: ["Academic", "Administrative"], default: "Academic" },
  rule: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  role: [{ type: String, trim: true }],
  filelink: { type: String, trim: true },
  active: { type: String, trim: true, enum: ["Yes", "No"], default: "Yes" },
  startdate: { type: Date },
  enddate: { type: Date }
}, { timestamps: true });

institutionRuleSchema.index({ colid: 1, type: 1, active: 1 });

module.exports = mongoose.models.institutionruleds || mongoose.model("institutionruleds", institutionRuleSchema);
