const mongoose = require("mongoose");

const neplmsAuditEmailConfigurationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  emailconfigurationid: { type: mongoose.Schema.Types.ObjectId },
  emailconfiguration: { type: String, trim: true },
  recipient: { type: String, trim: true },
  recipientname: { type: String, trim: true },
  subject: { type: String, trim: true },
  type: { type: String, trim: true, enum: ["Attendance", "Assignment", "Quiz", "Online examination", "Assessment"] },
  enabled: { type: String, trim: true, default: "Yes" },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true }
}, { timestamps: true });

neplmsAuditEmailConfigurationSchema.index({ colid: 1, type: 1, enabled: 1 });

module.exports = mongoose.models.neplmsauditemailconfigurationds || mongoose.model("neplmsauditemailconfigurationds", neplmsAuditEmailConfigurationSchema);
