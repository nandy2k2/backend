const mongoose = require("mongoose");

const BulkEmailLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  module: { type: String, enum: ["User", "CRM"], default: "User" },
  campaignid: String,
  campaignname: String,
  recipienttype: String,
  recipientid: String,
  recipientname: String,
  recipientemail: { type: String, required: true },
  subject: String,
  body: String,
  filelinks: [String],
  attachmentlinks: [String],
  emailconfigid: String,
  emailconfigname: String,
  fromemail: String,
  status: { type: String, default: "Pending" },
  error: String,
  opened: { type: String, enum: ["Yes", "No"], default: "No" },
  openedat: Date,
  trackingtoken: { type: String, index: true },
  sentat: Date,
  user: String,
  name: String
}, { timestamps: true });

BulkEmailLogSchema.index({ colid: 1, module: 1, campaignid: 1, opened: 1 });
BulkEmailLogSchema.index({ colid: 1, recipientemail: 1, createdAt: -1 });

module.exports = mongoose.models.bulkemaillogds || mongoose.model("bulkemaillogds", BulkEmailLogSchema);
