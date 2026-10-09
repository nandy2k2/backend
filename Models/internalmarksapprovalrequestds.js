const mongoose = require("mongoose");

const internalMarksApprovalRequestSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  requestno: { type: String, trim: true, required: true, index: true },
  academicyear: { type: String, trim: true, default: "" },
  exam: { type: String, trim: true, default: "" },
  examcode: { type: String, trim: true, default: "" },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  course: { type: String, trim: true, default: "" },
  coursecode: { type: String, trim: true, default: "" },
  componenttype: { type: String, trim: true, default: "" },
  scoretype: { type: String, trim: true, default: "" },
  assessmentgroup: { type: String, trim: true, default: "" },
  assessmentcomponent: { type: String, trim: true, default: "" },
  marksids: [{ type: String, trim: true }],
  markscount: { type: Number, default: 0 },
  currentlevel: { type: Number, default: 1 },
  currentapprovername: { type: String, trim: true, default: "" },
  currentapproveremail: { type: String, trim: true, default: "", index: true },
  approvalstatus: { type: String, enum: ["Pending", "Approved", "Rejected"], trim: true, default: "Pending", index: true },
  submittedby: { type: String, trim: true, default: "" },
  submittedbyname: { type: String, trim: true, default: "" },
  submitteddate: { type: String, trim: true, default: "" },
  approvedby: { type: String, trim: true, default: "" },
  approveddate: { type: String, trim: true, default: "" },
  comments: { type: String, trim: true, default: "" },
  history: { type: Array, default: [] },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

internalMarksApprovalRequestSchema.index({ colid: 1, requestno: 1 }, { unique: true });

module.exports = mongoose.model("internalmarksapprovalrequestds", internalMarksApprovalRequestSchema);
