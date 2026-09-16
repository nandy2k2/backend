const mongoose = require("mongoose");

const VoiceAiAgentDocumentSchema = new mongoose.Schema({
  title: { type: String, default: "" },
  filename: { type: String, default: "" },
  url: { type: String, default: "" },
  extractedtext: { type: String, default: "" },
  uploadedby: { type: String, default: "" },
  uploadeddate: { type: Date, default: Date.now }
}, { _id: false });

const VoiceAiAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentname: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  instructions: { type: String, default: "" },
  documents: { type: [VoiceAiAgentDocumentSchema], default: [] },
  provider: { type: String, default: "Gemini" },
  geminimodel: { type: String, default: "gemini-2.5-flash-lite" },
  ollamaconfigid: { type: String, default: "" },
  publicid: { type: String, required: true, unique: true, index: true },
  active: { type: String, default: "Yes" },
  status: { type: String, default: "Active" },
  name: { type: String, default: "" },
  user: { type: String, default: "" }
}, { timestamps: true });

VoiceAiAgentSchema.index({ colid: 1, agentname: 1 });
VoiceAiAgentSchema.index({ colid: 1, active: 1 });

module.exports = mongoose.models.voiceaiagentds || mongoose.model("voiceaiagentds", VoiceAiAgentSchema);
