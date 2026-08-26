const mongoose = require("mongoose");

const schoolStatuteSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, index: true },
  faculty: { type: String, trim: true, index: true },
  statute: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  filelink: { type: String, trim: true },
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

schoolStatuteSchema.index({ colid: 1, academicyear: 1, faculty: 1, approvalstatus: 1 });

module.exports = mongoose.models.institutionschoolstatuteds || mongoose.model("institutionschoolstatuteds", schoolStatuteSchema);
