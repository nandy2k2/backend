const mongoose = require("mongoose");

const legalCaseSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, index: true },
  caseno: { type: String, trim: true, index: true },
  court: { type: String, trim: true },
  title: { type: String, trim: true },
  description: { type: String, trim: true },
  startdate: { type: Date },
  lawyername: { type: String, trim: true },
  party: { type: [String], default: [] },
  partycontact: { type: String, trim: true },
  partyemail: { type: String, trim: true },
  lawyercontact: { type: String, trim: true },
  lawyeremail: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active", index: true }
}, { timestamps: true });

module.exports = mongoose.models.legalcaseds || mongoose.model("legalcaseds", legalCaseSchema);
