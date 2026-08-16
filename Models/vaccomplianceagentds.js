const mongoose = require("mongoose");

const VacComplianceAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentname: { type: String, default: "VAC Compliance Agent" },
  academicyear: { type: String, required: true, index: true },
  dayofweek: { type: String, required: true },
  timeofrunning: { type: String, required: true },
  reportemail: { type: String, required: true },
  targetcoursesperdepartment: { type: Number, default: 0 },
  minhours: { type: Number, default: 0 },
  status: { type: String, default: "Active" },
  lastrunkey: String,
  lastrunat: Date,
  laststatus: String,
  lastmessage: String,
  name: String,
  user: String
}, { timestamps: true });

VacComplianceAgentSchema.index({ colid: 1, academicyear: 1, dayofweek: 1, timeofrunning: 1, status: 1 });

module.exports = mongoose.models.vaccomplianceagentds || mongoose.model("vaccomplianceagentds", VacComplianceAgentSchema);
