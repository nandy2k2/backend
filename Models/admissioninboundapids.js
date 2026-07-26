const mongoose = require("mongoose");

const AdmissionInboundApiSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  formid: { type: String, required: true, trim: true, index: true },
  formtitle: { type: String, trim: true },
  apikey: { type: String, required: true, unique: true, index: true },
  endpoint: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true },
  username: { type: String, trim: true }
}, { timestamps: true });

AdmissionInboundApiSchema.index({ colid: 1, formid: 1 }, { unique: true });

module.exports = mongoose.model("admissioninboundapids", AdmissionInboundApiSchema);
