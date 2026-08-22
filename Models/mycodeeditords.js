const mongoose = require("mongoose");

const MyCodeEditorSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  title: { type: String, default: "", trim: true },
  description: { type: String, default: "" },
  status: { type: String, default: "Draft", index: true },
  selectedModels: { type: [String], default: [] },
  customModels: { type: String, default: "" },
  virtualModels: { type: String, default: "" },
  backendCode: { type: String, default: "" },
  frontendCode: { type: String, default: "" },
  sampleInput: { type: String, default: "{}" },
  lastBackendOutput: { type: mongoose.Schema.Types.Mixed, default: null },
  lastRunAt: { type: Date },
  createdby: { type: String, default: "" },
  user: { type: String, required: true, index: true }
}, { timestamps: true });

MyCodeEditorSchema.index({ colid: 1, user: 1, title: 1 });

module.exports = mongoose.models.mycodeeditords || mongoose.model("mycodeeditords", MyCodeEditorSchema);
