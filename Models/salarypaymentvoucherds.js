const mongoose = require('mongoose');

const salaryPaymentVoucherSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  sheetid: { type: String, required: true },
  month: { type: String, required: true },
  year: { type: String, required: true },
  totalamount: { type: Number, default: 0 },
  payments: { type: Array, default: [] },
  status: { type: String, default: 'Submitted' },
  currentlevel: { type: Number, default: 1 },
  createdby: { type: String },
  createdname: { type: String },
  approvalhistory: { type: Array, default: [] },
  ledgerposted: { type: String, default: 'No' },
  comments: { type: String, default: 'NA' }
}, { timestamps: true });

module.exports = mongoose.model('salarypaymentvoucherds', salaryPaymentVoucherSchema);
