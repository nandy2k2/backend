const mongoose = require("mongoose");

const mouSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, index: true },
  mou: { type: String, trim: true, required: true },
  details: { type: String, trim: true },
  type: { type: String, trim: true },
  party: { type: String, trim: true },
  description: { type: String, trim: true },
  level: { type: String, trim: true },
  startdate: { type: Date },
  enddate: { type: Date },
  faculty: { type: String, trim: true },
  department: { type: String, trim: true },
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

module.exports = mongoose.models.institutionmouds || mongoose.model("institutionmouds", mouSchema);
