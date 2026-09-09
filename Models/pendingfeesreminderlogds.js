const mongoose = require("mongoose");

const PendingFeesReminderLogSchema = new mongoose.Schema({
  colid: Number,
  agentid: String,
  academicyear: String,
  program: String,
  programcode: String,
  runby: String,
  runtype: String,
  subject: String,
  totalmatched: Number,
  totalrecipients: Number,
  sent: Number,
  failed: Number,
  results: Array,
  user: String,
  name: String
}, { timestamps: true });

PendingFeesReminderLogSchema.index({ colid: 1, agentid: 1, createdAt: -1 });
PendingFeesReminderLogSchema.index({ colid: 1, academicyear: 1, programcode: 1 });

module.exports = mongoose.model("pendingfeesreminderlogds", PendingFeesReminderLogSchema);
