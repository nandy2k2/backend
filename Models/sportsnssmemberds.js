const mongoose = require("mongoose");

const sportsNssMemberSchema = new mongoose.Schema({
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
  status: { type: String, default: "Active" },
  source: { type: String, default: "Manual" }
}, { timestamps: true });

sportsNssMemberSchema.index({ colid: 1, groupid: 1, regno: 1, studentemail: 1 });

module.exports = mongoose.model("sportsnssmemberds", sportsNssMemberSchema);
