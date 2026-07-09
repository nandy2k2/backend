const mongoose = require("mongoose");

const admissionRefundSchema = new mongoose.Schema({
  academicyear: { type: String },
  regulation: { type: String },
  major: { type: String },
  minor: { type: String },
  program: { type: String },
  programcode: { type: String },
  semester: { type: String },
  section: { type: String },
  student: { type: String },
  email: { type: String },
  phone: { type: String },
  regno: { type: String },
  feegroup: { type: String },
  feeitem: { type: String },
  amount: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  refunded: { type: Number, default: 0 },
  administrativecharges: { type: Number, default: 0 },
  grossrefund: { type: Number, default: 0 },
  netrefund: { type: Number, default: 0 },
  refunddate: { type: Date },
  refundmode: { type: String },
  refundrefno: { type: String },
  ledgerid: { type: String },
  colid: { type: Number, required: [true, "Please enter colid"] },
  createdby: { type: String },
  createdname: { type: String }
}, { timestamps: true });

admissionRefundSchema.index({ colid: 1, regno: 1 });
admissionRefundSchema.index({ colid: 1, academicyear: 1 });
admissionRefundSchema.index({ colid: 1, programcode: 1 });

module.exports = mongoose.model("Admissionrefundds", admissionRefundSchema);
