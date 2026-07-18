const mongoose = require('mongoose');

const hrExpenseWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  level: { type: Number, required: true },
  approverrole: { type: String, default: '' },
  approvername: { type: String, default: '' },
  approveremail: { type: String, default: '' },
  usemanager: { type: String, default: 'No' },
  status: { type: String, default: 'Active' },
  user: { type: String, default: '' },
  comments: { type: String, default: '' }
}, { timestamps: true });

hrExpenseWorkflowSchema.index({ colid: 1, level: 1 });

module.exports = mongoose.model('hrexpenseworkflowds', hrExpenseWorkflowSchema);
