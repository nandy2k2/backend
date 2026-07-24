const mongoose = require("mongoose");

const AdmissionAiAgentLevelSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  delayminutes: { type: Number, default: 0 },
  subject: { type: String, trim: true },
  description: { type: String, trim: true }
}, { _id: true });

const AdmissionAiAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  formid: { type: String, required: true, trim: true, index: true },
  formtitle: { type: String, trim: true },
  agentname: { type: String, trim: true, default: "Admission Email Agent" },
  status: { type: String, trim: true, default: "Active" },
  levels: [AdmissionAiAgentLevelSchema],
  user: { type: String, trim: true },
  username: { type: String, trim: true }
}, { timestamps: true });

AdmissionAiAgentSchema.index({ colid: 1, formid: 1, agentname: 1 }, { unique: true });

module.exports = mongoose.model("admissionaiagentds", AdmissionAiAgentSchema);
