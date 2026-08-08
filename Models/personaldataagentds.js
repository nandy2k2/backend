const mongoose = require("mongoose");

const PersonalDataAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentname: { type: String, trim: true, default: "Personal Data Agent" },
  academicyear: { type: String, trim: true, required: true, index: true },
  projectsperfaculty: { type: Number, default: 0 },
  publicationsperfaculty: { type: Number, default: 0 },
  seminarsperfaculty: { type: Number, default: 0 },
  dayofweek: { type: String, trim: true, required: true },
  timeofrunning: { type: String, trim: true, required: true },
  reportemail: { type: String, trim: true, required: true },
  status: { type: String, trim: true, default: "Active", index: true },
  lastrunkey: { type: String, trim: true, default: "" },
  lastrunat: Date,
  laststatus: { type: String, trim: true, default: "" },
  lastmessage: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

PersonalDataAgentSchema.index({ colid: 1, academicyear: 1, dayofweek: 1, timeofrunning: 1, status: 1 });

module.exports = mongoose.models.personaldataagentds || mongoose.model("personaldataagentds", PersonalDataAgentSchema);
