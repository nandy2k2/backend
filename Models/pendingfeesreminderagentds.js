const mongoose = require("mongoose");

const PendingFeesReminderAgentSchema = new mongoose.Schema({
  colid: Number,
  academicyear: String,
  program: String,
  programcode: String,
  subject: String,
  body: String,
  emailconfigid: String,
  emailconfigname: String,
  dayofweek: String,
  timeofrunning: String,
  active: {
    type: String,
    enum: ["Yes", "No"],
    default: "Yes"
  },
  lastScheduledRunKey: String,
  lastRunAt: Date,
  lastRunStatus: String,
  lastRunSummary: Object,
  user: String,
  name: String
}, { timestamps: true });

PendingFeesReminderAgentSchema.index({ colid: 1, academicyear: 1, programcode: 1, active: 1 });
PendingFeesReminderAgentSchema.index({ colid: 1, dayofweek: 1, timeofrunning: 1, active: 1 });

module.exports = mongoose.model("pendingfeesreminderagentds", PendingFeesReminderAgentSchema);
