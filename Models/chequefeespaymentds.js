const mongoose = require("mongoose");

const ChequeFeesPaymentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  source: { type: String, trim: true, default: "Counter Fee" },
  ledgerid: { type: String, required: true, index: true },
  transactionid: { type: String, trim: true },
  originaldate: { type: Date },
  chequerealizeddate: { type: Date },
  referenceNumber: { type: String, trim: true },
  paydetails: { type: String, trim: true },
  remarks: { type: String, trim: true },
  status: { type: String, trim: true, default: "Pending" },
  academicyear: String,
  admissionyear: String,
  regulation: String,
  program: String,
  programcode: String,
  semester: String,
  section: String,
  major: String,
  minor: String,
  student: String,
  regno: String,
  email: String,
  phone: String,
  address: String,
  feegroup: String,
  feeitem: String,
  feecategory: String,
  feetype: String,
  feebook: String,
  cashbook: String,
  amount: Number,
  previouspaid: Number,
  previousbalance: Number,
  chequeamount: Number,
  newpaid: Number,
  newbalance: Number,
  collectedby: String,
  collectedbyname: String,
  realizedby: String,
  realizedbyname: String
}, { timestamps: true });

ChequeFeesPaymentSchema.index({ colid: 1, status: 1 });
ChequeFeesPaymentSchema.index({ colid: 1, originaldate: 1 });
ChequeFeesPaymentSchema.index({ colid: 1, chequerealizeddate: 1 });
ChequeFeesPaymentSchema.index({ colid: 1, regno: 1 });

module.exports = mongoose.model("chequefeespaymentds", ChequeFeesPaymentSchema);
