const mongoose = require('mongoose');

const RecruitmentInterviewScoreSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  jobid: { type: String, required: true, index: true },
  jobtitle: { type: String, default: '' },
  applicationid: { type: String, required: true, index: true },
  applicationno: { type: String, default: '' },
  candidate: { type: String, default: '' },
  candidateemail: { type: String, default: '' },
  panelmembername: { type: String, default: '' },
  panelmemberemail: { type: String, default: '', index: true },
  parameterid: { type: String, default: '' },
  parameter: { type: String, required: true },
  description: { type: String, default: '' },
  maxmarks: { type: Number, default: 10 },
  marks: { type: Number, default: 0 },
  comments: { type: String, default: '' },
  status: { type: String, default: 'Submitted' },
  submittedat: { type: Date, default: Date.now },
  user: { type: String, default: '' }
}, { timestamps: true });

RecruitmentInterviewScoreSchema.index({ colid: 1, jobid: 1, applicationid: 1, panelmemberemail: 1, parameter: 1 }, { unique: true });

module.exports = mongoose.model('recruitmentinterviewscoreds', RecruitmentInterviewScoreSchema);
