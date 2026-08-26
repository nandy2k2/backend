const mongoose = require("mongoose");

const institutionAffiliationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, index: true },
  affiliation: { type: String, trim: true, required: true },
  agency: { type: String, trim: true },
  startdate: { type: Date },
  duedate: { type: Date },
  approvalstatus: { type: String, trim: true, default: "Draft", index: true },
  currentlevel: { type: Number, default: 0 },
  pendingapprovername: { type: String, trim: true },
  pendingapproveremail: { type: String, trim: true, index: true },
  pendingapproverrole: { type: String, trim: true },
  submittedat: { type: Date },
  approvedat: { type: Date },
  rejectedat: { type: Date },
  approvalhistory: [{
    level: Number,
    action: { type: String, trim: true },
    approvername: { type: String, trim: true },
    approveremail: { type: String, trim: true },
    approverrole: { type: String, trim: true },
    comments: { type: String, trim: true },
    actiondate: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.models.institutionaffiliationds || mongoose.model("institutionaffiliationds", institutionAffiliationSchema);
