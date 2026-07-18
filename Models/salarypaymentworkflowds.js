const mongoose = require('mongoose');

const salaryPaymentWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  workflowtype: { type: String, enum: ['SalarySheet', 'PaymentVoucher'], required: true },
  level: { type: Number, required: true },
  approverrole: { type: String, default: '' },
  approvername: { type: String, default: '' },
  approveremail: { type: String, default: '' },
  status: { type: String, default: 'Active' },
  user: { type: String },
  comments: { type: String, default: 'NA' }
}, { timestamps: true });

module.exports = mongoose.model('salarypaymentworkflowds', salaryPaymentWorkflowSchema);
