const mongoose = require("mongoose");

const AiDebateAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  title: { type: String, trim: true, required: true },
  topic: { type: String, trim: true, required: true },
  keywords: { type: [String], default: [] },
  additionalprompt: { type: String, default: "" },
  mode: {
    type: String,
    enum: ["Aggressive", "Moderate", "Sober"],
    default: "Moderate"
  },
  provider: { type: String, trim: true, default: "Gemini" },
  geminimodel: { type: String, trim: true, default: "gemini-2.5-flash-lite" },
  ollamaconfigid: { type: String, trim: true, default: "" },
  active: { type: String, trim: true, default: "Yes" },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  laststartedat: { type: Date },
  lasttranscript: { type: String, default: "" },
  lastresponse: { type: String, default: "" }
}, { timestamps: true });

AiDebateAgentSchema.index({ colid: 1, active: 1, status: 1 });
AiDebateAgentSchema.index({ colid: 1, title: 1 });

module.exports = mongoose.models.aidebateagentds || mongoose.model("aidebateagentds", AiDebateAgentSchema);
