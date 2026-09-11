const mongoose = require("mongoose");

const sportsNssApplicationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  groupid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssgroupds", required: true },
  activityid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssactivityds" },
  activity: { type: String },
  activitytype: { type: String },
  groupname: { type: String },
  studentid: { type: mongoose.Schema.Types.ObjectId },
  student: { type: String },
  studentemail: { type: String },
  regno: { type: String },
  academicyear: { type: String },
  regulation: { type: String },
  program: { type: String },
  programcode: { type: String },
  semester: { type: String },
  section: { type: String },
  application: { type: String },
  reason: { type: String },
  attachmentlink: { type: String },
  status: { type: String, default: "Pending" },
  approver: { type: String },
  approveremail: { type: String },
  approvaldate: { type: Date },
  approvercomment: { type: String }
}, { timestamps: true });

sportsNssApplicationSchema.index({ colid: 1, groupid: 1, studentemail: 1 });

module.exports = mongoose.model("sportsnssapplicationds", sportsNssApplicationSchema);
