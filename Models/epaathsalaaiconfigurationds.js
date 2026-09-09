const mongoose = require("mongoose");

const EpaathsalaAiConfigurationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  name: { type: String, required: true, trim: true },
  server: { type: String, trim: true, default: "" },
  xapikey: { type: String, trim: true, default: "" },
  default: { type: String, enum: ["Yes", "No"], default: "No" },
  active: { type: String, enum: ["Yes", "No"], default: "Yes" },
  createdname: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

EpaathsalaAiConfigurationSchema.index({ colid: 1, name: 1 }, { unique: true });
EpaathsalaAiConfigurationSchema.index({ colid: 1, active: 1, default: 1 });

module.exports = mongoose.model("epaathsalaaiconfigurationds", EpaathsalaAiConfigurationSchema);
