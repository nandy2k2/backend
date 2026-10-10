const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Pending" },
  response: { type: mongoose.Schema.Types.Mixed },
  error: { type: String, trim: true, default: "" }
}, { _id: false });

const bhashWhatsappLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  configid: { type: mongoose.Schema.Types.ObjectId, ref: "bhashwhatsappconfigds" },
  configname: { type: String, trim: true, default: "" },
  title: { type: String, trim: true, default: "" },
  content: { type: String, trim: true, default: "" },
  total: { type: Number, default: 0 },
  success: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  user: { type: String, trim: true, default: "" },
  recipients: [recipientSchema]
}, { timestamps: true });

bhashWhatsappLogSchema.index({ colid: 1, createdAt: -1 });

module.exports = mongoose.models.bhashwhatsapplogds || mongoose.model("bhashwhatsapplogds", bhashWhatsappLogSchema);
