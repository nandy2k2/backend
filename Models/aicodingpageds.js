const mongoose = require("mongoose");

const AiCodingPageSchema = new mongoose.Schema({
  colid: { type: Number, index: true },
  title: { type: String, default: "" },
  slug: { type: String, default: "", index: true },
  description: { type: String, default: "" },
  requirement: { type: String, default: "" },
  provider: { type: String, default: "Gemini" },
  geminiModel: { type: String, default: "gemini-2.5-flash-lite" },
  ollamaConfigId: { type: String, default: "" },
  crudMode: { type: String, default: "CRUD" },
  dropdownRules: { type: String, default: "" },
  selectedModels: { type: [String], default: [] },
  modelDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  pageCode: { type: String, default: "" },
  pageSchema: { type: mongoose.Schema.Types.Mixed, default: {} },
  refinementHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  status: { type: String, default: "Generated" },
  createdby: { type: String, default: "" },
  user: { type: String, default: "" }
}, { timestamps: true });

AiCodingPageSchema.index({ colid: 1, slug: 1 });
AiCodingPageSchema.index({ colid: 1, title: 1 });

module.exports = mongoose.model("aicodingpageds", AiCodingPageSchema);
