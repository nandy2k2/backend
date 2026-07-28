const mongoose = require('mongoose');

const RecruitmentInterviewParameterSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  jobid: { type: String, required: true, index: true },
  jobtitle: { type: String, default: '' },
  parameter: { type: String, required: true },
  description: { type: String, default: '' },
  maxmarks: { type: Number, default: 10 },
  order: { type: Number, default: 0 },
  status: { type: String, default: 'Active' },
  user: { type: String, default: '' }
}, { timestamps: true });

RecruitmentInterviewParameterSchema.index({ colid: 1, jobid: 1, parameter: 1 }, { unique: true });

module.exports = mongoose.model('recruitmentinterviewparameterds', RecruitmentInterviewParameterSchema);
