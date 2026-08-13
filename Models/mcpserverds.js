const mongoose = require("mongoose");

const mcpServerSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  title: { type: String, required: true, trim: true },
  command: { type: String, trim: true, default: "" },
  remoteaddress: { type: String, trim: true, default: "" },
  token: { type: String, trim: true, default: "" },
  headers: { type: String, trim: true, default: "" },
  arguments: { type: String, trim: true, default: "" },
  active: { type: String, enum: ["Yes", "No"], default: "Yes" },
  default: { type: String, enum: ["Yes", "No"], default: "No" },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

mcpServerSchema.index({ colid: 1, active: 1, default: 1 });
mcpServerSchema.index({ colid: 1, title: 1 }, { unique: true });

module.exports = mongoose.model("mcpserverds", mcpServerSchema);
