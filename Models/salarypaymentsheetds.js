const mongoose = require('mongoose');

const salaryPaymentSheetSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  month: { type: String, required: true },
  year: { type: String, required: true },
  totalamount: { type: Number, default: 0 },
  employeeCount: { type: Number, default: 0 },
  rows: { type: Array, default: [] },
  status: { type: String, default: 'Submitted' },
  currentlevel: { type: Number, default: 1 },
  submittedby: { type: String },
  submittedname: { type: String },
  approvalhistory: { type: Array, default: [] },
  comments: { type: String, default: 'NA' }
}, { timestamps: true });

salaryPaymentSheetSchema.index({ colid: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('salarypaymentsheetds', salaryPaymentSheetSchema);
