const mongoose = require("mongoose");

const AiCodingAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true, index: true },
  createdby: { type: String, trim: true },
  title: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Draft" },
  active: { type: String, trim: true, default: "No" },
  scheduleMode: { type: String, trim: true, default: "Manual" },
  scheduleDay: { type: String, trim: true },
  scheduleTime: { type: String, trim: true },
  provider: { type: String, trim: true, default: "Gemini" },
  geminiModel: { type: String, trim: true, default: "gemini-2.5-flash-lite" },
  ollamaConfigId: { type: String, trim: true },
  selectedModels: { type: [String], default: [] },
  prompt: { type: String },
  agentCode: { type: String },
  sampleInput: { type: String, default: "{}" },
  lastRunAt: { type: Date },
  lastRunBy: { type: String, trim: true },
  lastRunType: { type: String, trim: true },
  lastRunStatus: { type: String, trim: true },
  lastRunOutput: { type: mongoose.Schema.Types.Mixed },
  lastRunLogs: { type: [String], default: [] },
  lastScheduledRunKey: { type: String, trim: true }
}, { timestamps: true });

AiCodingAgentSchema.index({ colid: 1, active: 1, scheduleMode: 1, scheduleDay: 1, scheduleTime: 1 });

module.exports = mongoose.model("aicodingagentds", AiCodingAgentSchema);
