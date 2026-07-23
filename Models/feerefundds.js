const mongoose = require("mongoose");

const feeRefundSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  ledgerid: String,
  academicyear: String,
  admissionyear: String,
  program: String,
  programcode: String,
  regulation: String,
  major: String,
  minor: String,
  semester: String,
  section: String,
  student: String,
  regno: String,
  user: String,
  feegroup: String,
  feeitem: String,
  feecategory: String,
  feetype: String,
  amount: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  concession: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  refundable: { type: String, default: "Yes" },
  refundamount: { type: Number, default: 0 },
  refunddate: Date,
  refundedamount: { type: Number, default: 0 },
  refundmode: String,
  refundrefno: String,
  refundcomments: String,
  bankname: String,
  branchname: String,
  accountholdername: String,
  accountnumber: String,
  ifsccode: String,
  accounttype: String,
  upiid: String,
  bankattachmenturl: String,
  status: { type: String, default: "Refunded" },
  processedby: String,
  processedbyname: String,
  createdby: String,
  updatedby: String
}, { timestamps: true });

feeRefundSchema.index({ colid: 1, academicyear: 1, programcode: 1 });
feeRefundSchema.index({ colid: 1, regno: 1 });
feeRefundSchema.index({ colid: 1, refunddate: 1 });

module.exports = mongoose.model("feerefundds", feeRefundSchema);
