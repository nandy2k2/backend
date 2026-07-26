const mongoose = require("mongoose");

const CrmAiAgentLevelSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  delayminutes: { type: Number, default: 0 },
  subject: { type: String, trim: true },
  description: { type: String, trim: true }
}, { _id: true });

const CrmAiAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true, index: true },
  level: { type: String, trim: true },
  agentname: { type: String, trim: true, default: "CRM Email Agent" },
  status: { type: String, trim: true, default: "Active" },
  levels: [CrmAiAgentLevelSchema],
  user: { type: String, trim: true },
  username: { type: String, trim: true }
}, { timestamps: true });

CrmAiAgentSchema.index({ colid: 1, programcode: 1, level: 1, agentname: 1 }, { unique: true });

module.exports = mongoose.model("crmaiagentds", CrmAiAgentSchema);
