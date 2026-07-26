const mongoose = require("mongoose");

const CrmInboundApiSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  apiname: { type: String, trim: true, default: "CRM Inbound API" },
  apikey: { type: String, required: true, unique: true, index: true },
  endpoint: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true },
  username: { type: String, trim: true }
}, { timestamps: true });

CrmInboundApiSchema.index({ colid: 1, apiname: 1 }, { unique: true });

module.exports = mongoose.model("crminboundapids", CrmInboundApiSchema);
