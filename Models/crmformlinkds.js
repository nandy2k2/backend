const mongoose = require("mongoose");

const CrmFormLinkSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  formname: { type: String, trim: true, default: "CRM Lead Form" },
  source: { type: String, trim: true, default: "Website" },
  pipeline_stage: { type: String, trim: true, default: "New Lead" },
  leadstatus: { type: String, trim: true, default: "Active" },
  status: { type: String, trim: true, default: "Active" },
  publicurl: { type: String, trim: true },
  user: { type: String, trim: true },
  username: { type: String, trim: true }
}, { timestamps: true });

CrmFormLinkSchema.index({ colid: 1, formname: 1 }, { unique: true });

module.exports = mongoose.model("crmformlinkds", CrmFormLinkSchema);
