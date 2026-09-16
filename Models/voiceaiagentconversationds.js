const mongoose = require("mongoose");

const VoiceAiAgentConversationSchema = new mongoose.Schema({
  colid: { type: Number, index: true },
  agentid: { type: String, index: true },
  publicid: { type: String, index: true },
  visitorid: { type: String, default: "" },
  question: { type: String, default: "" },
  answer: { type: String, default: "" },
  source: { type: String, default: "Public link" }
}, { timestamps: true });

VoiceAiAgentConversationSchema.index({ colid: 1, createdAt: -1 });

module.exports = mongoose.models.voiceaiagentconversationds || mongoose.model("voiceaiagentconversationds", VoiceAiAgentConversationSchema);
