const mongoose = require("mongoose");

const VacComplianceAgentLogSchema = new mongoose.Schema({
  colid: { type: Number, index: true },
  agentid: { type: mongoose.Schema.Types.ObjectId, ref: "vaccomplianceagentds", index: true },
  agentname: String,
  academicyear: String,
  runkey: String,
  runat: { type: Date, default: Date.now },
  reportemail: String,
  status: String,
  departmentcount: Number,
  deviationcount: Number,
  reporthtml: String,
  reportjson: String,
  error: String,
  user: String
}, { timestamps: true });

VacComplianceAgentLogSchema.index({ colid: 1, agentid: 1, runkey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.vaccomplianceagentlogds || mongoose.model("vaccomplianceagentlogds", VacComplianceAgentLogSchema);
