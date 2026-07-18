const mongoose = require('mongoose');

const hrExpenseRuleSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  role: { type: String, required: true },
  validationcriteria: { type: String, default: '' },
  mandatorycriteria: { type: String, default: '' },
  optionalcriteria: { type: String, default: '' },
  status: { type: String, default: 'Active' },
  user: { type: String, default: '' },
  comments: { type: String, default: '' }
}, { timestamps: true });

hrExpenseRuleSchema.index({ colid: 1, role: 1 });

module.exports = mongoose.model('hrexpenseruleds', hrExpenseRuleSchema);
