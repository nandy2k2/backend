const mongoose = require("mongoose");

const bhashWhatsappTemplateSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  templatename: { type: String, trim: true, required: true },
  templatecode: { type: String, trim: true, required: true },
  provider: { type: String, trim: true, default: "BhashSMS" },
  noofvariables: { type: Number, default: 0 },
  variablenames: { type: String, trim: true, default: "" },
  active: { type: String, trim: true, default: "Yes", index: true },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

bhashWhatsappTemplateSchema.index({ colid: 1, templatecode: 1 });
bhashWhatsappTemplateSchema.index({ colid: 1, templatename: 1 });

module.exports = mongoose.models.bhashwhatsapptemplateds || mongoose.model("bhashwhatsapptemplateds", bhashWhatsappTemplateSchema);
