const mongoose = require("mongoose");

const CrmAiAgentLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentid: { type: mongoose.Schema.Types.ObjectId, ref: "crmaiagentds", index: true },
  leadid: { type: String, trim: true, index: true },
  leadname: { type: String, trim: true },
  email: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  levelname: { type: String, trim: true },
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

CrmAiAgentLogSchema.index({ colid: 1, agentid: 1, leadid: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("crmaiagentlogds", CrmAiAgentLogSchema);
