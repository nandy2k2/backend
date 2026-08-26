const mongoose = require("mongoose");

const mouWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true },
  level: { type: Number, required: true },
  approverrole: { type: String, trim: true },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true },
  active: { type: String, trim: true, default: "Yes" },
  comments: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.institutionmouworkflowds || mongoose.model("institutionmouworkflowds", mouWorkflowSchema);
