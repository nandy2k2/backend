const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  studentid: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ledgerid: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledgerstud', required: true, index: true },
  feeconfigurationid: { type: mongoose.Schema.Types.ObjectId, ref: 'Fees' },
  student: String,
  regno: String,
  academicyear: String,
  program: String,
  programcode: String,
  semester: String,
  feegroup: String,
  feecategory: String,
  feeitem: String,
  amount: Number,
  paid: Number,
  oldconcession: Number,
  newconcession: Number,
  oldbalance: Number,
  newbalance: Number,
  careofname: String,
  careofemail: String,
  reference: String,
  documentlink: String,
  actor: String
}, { timestamps: true });

schema.index({ colid: 1, regno: 1, createdAt: -1 });

module.exports = mongoose.models.Adhocscholarshipds || mongoose.model('Adhocscholarshipds', schema);
