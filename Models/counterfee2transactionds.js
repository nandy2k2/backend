const mongoose = require("mongoose");

const CounterFee2ItemSchema = new mongoose.Schema({
  ledgerid: String,
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
  paidamount: Number,
  newpaid: Number,
  newbalance: Number
}, { _id: false });

const CounterFee2TransactionSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  transactionid: { type: String, required: true, unique: true },
  paiddate: Date,
  referenceNumber: String,
  paymode: String,
  paydetails: String,
  remarks: String,
  collectedby: String,
  collectedbyname: String,
  totalpaid: Number,
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
  items: [CounterFee2ItemSchema]
}, { timestamps: true });

CounterFee2TransactionSchema.index({ colid: 1, transactionid: 1 });
CounterFee2TransactionSchema.index({ colid: 1, paiddate: 1 });
CounterFee2TransactionSchema.index({ colid: 1, regno: 1 });

module.exports = mongoose.model("CounterFee2Transactionds", CounterFee2TransactionSchema);
