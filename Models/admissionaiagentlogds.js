const mongoose = require("mongoose");

const AdmissionAiAgentLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentid: { type: mongoose.Schema.Types.ObjectId, ref: "admissionaiagentds", index: true },
  formid: { type: String, trim: true, index: true },
  applicationid: { type: String, trim: true, index: true },
  applicant: { type: String, trim: true },
  email: { type: String, trim: true },
  level: { type: Number, required: true },
  delayminutes: { type: Number, default: 0 },
  scheduledfor: Date,
  sentat: Date,
  subject: { type: String, trim: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Scheduled" },
  error: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

AdmissionAiAgentLogSchema.index({ colid: 1, agentid: 1, applicationid: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("admissionaiagentlogds", AdmissionAiAgentLogSchema);
