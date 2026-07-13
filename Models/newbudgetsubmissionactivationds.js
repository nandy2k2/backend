const mongoose = require("mongoose");

const NewBudgetSubmissionActivationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  useremail: { type: String, required: true, trim: true, lowercase: true },
  username: { type: String, trim: true },
  department: { type: String, trim: true },
  active: { type: String, default: "Yes" },
  used: { type: String, default: "No" },
  usedat: { type: Date },
  activatedby: { type: String, trim: true },
  activatedbyname: { type: String, trim: true },
  remarks: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("newbudgetsubmissionactivationds", NewBudgetSubmissionActivationSchema);
