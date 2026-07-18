const mongoose = require('mongoose');

const RecruitmentOfferTemplateSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  templateid: { type: String, required: true },
  templatename: { type: String, required: true },
  jobrole: { type: String, default: '' },
  description: { type: String, default: '' },
  htmlcontent: { type: String, default: '' },
  status: { type: String, default: 'Active' },
  issample: { type: String, default: 'No' },
  user: { type: String, default: '' }
}, { timestamps: true });

RecruitmentOfferTemplateSchema.index({ colid: 1, templateid: 1 }, { unique: true });

module.exports = mongoose.model('recruitmentoffertemplateds', RecruitmentOfferTemplateSchema);
