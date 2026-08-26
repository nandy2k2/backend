const mongoose = require("mongoose");

const legalCaseHearingSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  caseid: { type: String, trim: true, required: true, index: true },
  caseno: { type: String, trim: true },
  court: { type: String, trim: true },
  hearing: { type: String, trim: true },
  hearingdate: { type: Date, index: true },
  title: { type: String, trim: true },
  topic: { type: String, trim: true },
  outcome: { type: String, trim: true },
  issues: { type: String, trim: true },
  nexthearingdate: { type: Date, index: true },
  status: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.legalcasehearingds || mongoose.model("legalcasehearingds", legalCaseHearingSchema);
