const mongoose = require("mongoose");

const lateFeeWaiverRequestSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  ledgerid: { type: mongoose.Schema.Types.ObjectId, ref: "Ledgerstud", required: true, index: true },
  academicyear: { type: String, trim: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  semester: { type: String, trim: true },
  feegroup: { type: String, trim: true },
  feeitem: { type: String, trim: true },
  student: { type: String, trim: true },
  regno: { type: String, trim: true, index: true },
  studentemail: { type: String, trim: true },
  amount: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  concession: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  latefineamount: { type: Number, default: 0 },
  waivedamount: { type: Number, default: 0 },
  reason: { type: String, trim: true },
  approvalstatus: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending", index: true },
  currentlevel: { type: Number, default: 1 },
  currentapprovername: { type: String, trim: true },
  currentapproveremail: { type: String, trim: true, index: true },
  approvalhistory: { type: Array, default: [] },
  appliedby: { type: String, trim: true },
  appliedname: { type: String, trim: true },
  approvedby: { type: String, trim: true },
  approvedname: { type: String, trim: true },
  approveddate: { type: Date },
  rejectedby: { type: String, trim: true },
  rejectedname: { type: String, trim: true },
  rejecteddate: { type: Date },
  comments: { type: String, trim: true }
}, { timestamps: true });

lateFeeWaiverRequestSchema.index({ colid: 1, ledgerid: 1, approvalstatus: 1 });

module.exports = mongoose.models.latefeewaiverrequestds || mongoose.model("latefeewaiverrequestds", lateFeeWaiverRequestSchema);
