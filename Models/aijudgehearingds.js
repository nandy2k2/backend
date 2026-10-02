const mongoose = require("mongoose");

const AiJudgeDocumentSchema = new mongoose.Schema({
  title: { type: String, trim: true, default: "" },
  side: { type: String, trim: true, default: "Shared" },
  filelink: { type: String, trim: true, default: "" },
  filename: { type: String, trim: true, default: "" },
  mimetype: { type: String, trim: true, default: "" },
  uploadedby: { type: String, trim: true, default: "" },
  uploadedat: { type: Date, default: Date.now },
  notes: { type: String, default: "" },
  generated: { type: String, trim: true, default: "No" }
}, { _id: true });

const AiJudgeMessageSchema = new mongoose.Schema({
  role: { type: String, trim: true, default: "" },
  side: { type: String, trim: true, default: "" },
  text: { type: String, default: "" },
  createdat: { type: Date, default: Date.now }
}, { _id: true });

const AiJudgeHearingSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  title: { type: String, trim: true, required: true },
  casedescription: { type: String, required: true },
  userSide: { type: String, trim: true, enum: ["Petitioner", "Respondent"], default: "Petitioner" },
  aiLawyerSide: { type: String, trim: true, enum: ["Petitioner", "Respondent"], default: "Respondent" },
  aiLawyerExperience: { type: String, trim: true, enum: ["Easy", "Medium", "Very experienced"], default: "Medium" },
  provider: { type: String, trim: true, default: "Gemini" },
  geminimodel: { type: String, trim: true, default: "gemini-2.5-flash-lite" },
  ollamaconfigid: { type: String, trim: true, default: "" },
  active: { type: String, trim: true, default: "Yes" },
  status: { type: String, trim: true, default: "Draft" },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  transcript: { type: [AiJudgeMessageSchema], default: [] },
  documents: { type: [AiJudgeDocumentSchema], default: [] },
  laststartedat: { type: Date },
  lastpausedat: { type: Date },
  lastactivityat: { type: Date, default: Date.now }
}, { timestamps: true });

AiJudgeHearingSchema.index({ colid: 1, status: 1, updatedAt: -1 });
AiJudgeHearingSchema.index({ colid: 1, title: 1 });

module.exports = mongoose.models.aijudgehearingds || mongoose.model("aijudgehearingds", AiJudgeHearingSchema);
