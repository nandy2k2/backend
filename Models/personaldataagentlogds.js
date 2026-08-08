const mongoose = require("mongoose");

const PersonalDataAgentLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentid: { type: mongoose.Schema.Types.ObjectId, ref: "personaldataagentds", index: true },
  agentname: { type: String, trim: true, default: "" },
  academicyear: { type: String, trim: true, default: "", index: true },
  runkey: { type: String, trim: true, default: "", index: true },
  scheduledfor: Date,
  runat: { type: Date, default: Date.now },
  reportemail: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Pending", index: true },
  facultycount: { type: Number, default: 0 },
  deficitcount: { type: Number, default: 0 },
  reporthtml: { type: String, default: "" },
  reportjson: { type: String, default: "" },
  error: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

PersonalDataAgentLogSchema.index({ colid: 1, agentid: 1, runkey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.personaldataagentlogds || mongoose.model("personaldataagentlogds", PersonalDataAgentLogSchema);
