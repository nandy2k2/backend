const mongoose = require("mongoose");

const nepLmsOtpAttendanceConfigurationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  numberofotps: { type: Number, min: 1, max: 6, default: 6 },
  active: { type: String, trim: true, enum: ["Yes", "No"], default: "Yes", index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true }
}, { timestamps: true });

nepLmsOtpAttendanceConfigurationSchema.index({ colid: 1, active: 1, updatedAt: -1 });

module.exports = mongoose.models.neplmsotpattendanceconfigurationds || mongoose.model("neplmsotpattendanceconfigurationds", nepLmsOtpAttendanceConfigurationSchema);
