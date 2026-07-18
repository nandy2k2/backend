const mongoose = require('mongoose');

const RecruitmentOnboardingStepSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, required: true, index: true },
  stepid: { type: String, required: true },
  stepname: { type: String, required: true },
  description: { type: String, default: '' },
  order: { type: Number, default: 0 },
  documentrequired: { type: String, default: 'No' },
  status: { type: String, default: 'Active' },
  user: { type: String, default: '' }
}, { timestamps: true });

RecruitmentOnboardingStepSchema.index({ colid: 1, role: 1, stepid: 1 }, { unique: true });

module.exports = mongoose.model('recruitmentonboardingstepds', RecruitmentOnboardingStepSchema);
