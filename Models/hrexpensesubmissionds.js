const mongoose = require('mongoose');

const hrExpenseSubmissionSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  employee: { type: String, default: '' },
  employeeemail: { type: String, required: true },
  department: { type: String, default: '' },
  role: { type: String, default: '' },
  submissiondate: { type: Date, default: Date.now },
  status: { type: String, default: 'Draft' },
  currentlevel: { type: Number, default: 0 },
  validationstatus: { type: String, default: 'Not checked' },
  validationcomments: { type: String, default: '' },
  items: { type: Array, default: [] },
  documents: { type: Array, default: [] },
  totalamount: { type: Number, default: 0 },
  approvedamount: { type: Number, default: 0 },
  approvalhistory: { type: Array, default: [] },
  salaryposted: { type: String, default: 'No' },
  user: { type: String, default: '' },
  comments: { type: String, default: '' }
}, { timestamps: true });

hrExpenseSubmissionSchema.index({ colid: 1, employeeemail: 1, status: 1 });
hrExpenseSubmissionSchema.index({ colid: 1, department: 1, submissiondate: 1 });

module.exports = mongoose.model('hrexpensesubmissionds', hrExpenseSubmissionSchema);
