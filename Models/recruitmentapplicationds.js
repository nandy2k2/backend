const mongoose = require('mongoose');

const RecruitmentApplicationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  jobid: { type: String, required: true, index: true },
  formid: { type: String, required: true, index: true },
  applicationno: { type: String, default: '', index: true },
  applicantname: { type: String, default: '' },
  email: { type: String, default: '', index: true },
  phone: { type: String, default: '', index: true },
  username: { type: String, default: '' },
  password: { type: String, default: '' },
  status: { type: String, default: 'Submitted' },
  photourl: { type: String, default: '' },
  approvalstatus: { type: String, default: 'Pending' },
  approvallevel: { type: Number, default: 0 },
  approvalhistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  customfields: { type: mongoose.Schema.Types.Mixed, default: {} },
  documents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  educationalqualifications: { type: [mongoose.Schema.Types.Mixed], default: [] },
  familydetails: { type: [mongoose.Schema.Types.Mixed], default: [] },
  pastemployments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  totalexperience: { type: String, default: '' },
  candidatedocuments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  validationstatus: { type: String, default: '' },
  validationcomments: { type: String, default: '' },
  mandatoryvalidationstatus: { type: String, default: '' },
  mandatoryvalidationcomments: { type: String, default: '' },
  shortlistcomments: { type: String, default: '' },
  submittedat: { type: Date, default: Date.now }
}, { timestamps: true });

RecruitmentApplicationSchema.index({ colid: 1, jobid: 1, email: 1 }, { unique: true, sparse: true });
RecruitmentApplicationSchema.index({ colid: 1, jobid: 1, phone: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('recruitmentapplicationds', RecruitmentApplicationSchema);
