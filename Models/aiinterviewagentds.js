const mongoose = require("mongoose");

const AiInterviewAgentSchema = new mongoose.Schema({
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
  lastanswer: { type: String, default: "" },
  lastassessment: { type: String, default: "" },
  lastquestion: { type: String, default: "" }
}, { timestamps: true });

AiInterviewAgentSchema.index({ colid: 1, active: 1, status: 1 });
AiInterviewAgentSchema.index({ colid: 1, title: 1 });

module.exports = mongoose.models.aiinterviewagentds || mongoose.model("aiinterviewagentds", AiInterviewAgentSchema);
