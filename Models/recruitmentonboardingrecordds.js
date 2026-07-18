const mongoose = require('mongoose');

const RecruitmentOnboardingRecordSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  jobid: { type: String, required: true, index: true },
  jobtitle: { type: String, default: '' },
  applicationid: { type: String, required: true, index: true },
  applicationno: { type: String, default: '' },
  candidate: { type: String, default: '' },
  candidateemail: { type: String, default: '', index: true },
  candidatephone: { type: String, default: '' },
  role: { type: String, default: '' },
  overallstatus: { type: String, default: 'Pending' },
  steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
  remarks: { type: String, default: '' },
  completedat: Date,
  user: { type: String, default: '' }
}, { timestamps: true });

RecruitmentOnboardingRecordSchema.index({ colid: 1, jobid: 1, applicationid: 1 }, { unique: true });

module.exports = mongoose.model('recruitmentonboardingrecordds', RecruitmentOnboardingRecordSchema);
