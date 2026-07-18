const mongoose = require('mongoose');

const employeeLedgerNewSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  employee: { type: String },
  empid: { type: String },
  employeeemail: { type: String },
  department: { type: String },
  role: { type: String },
  month: { type: String },
  year: { type: String },
  paymentdate: { type: Date },
  paymentmode: { type: String },
  paymenttype: { type: String },
  referencenumber: { type: String },
  item: { type: String },
  description: { type: String },
  amount: { type: Number, default: 0 },
  voucherid: { type: String },
  sheetid: { type: String },
  user: { type: String },
  status1: { type: String, default: 'Paid' },
  comments: { type: String, default: 'NA' }
}, { timestamps: true });

employeeLedgerNewSchema.index({ colid: 1, empid: 1, month: 1, year: 1 });
employeeLedgerNewSchema.index({ colid: 1, paymentdate: 1 });

module.exports = mongoose.model('employeeledgernewds', employeeLedgerNewSchema);
