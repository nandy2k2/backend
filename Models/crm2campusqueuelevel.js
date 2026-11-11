const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  colid: { type: Number, required: true },
  program: { type: String, required: true },
  programcode: { type: String, required: true },
  level: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, maxlength: 2000 },
  active: { type: String, enum: ['Yes', 'No'], default: 'Yes' },
  campuscounselorid: { type: mongoose.Schema.Types.ObjectId, default: null },
  campuscounselor: { type: String, default: '' },
  campuscounseloremail: { type: String, default: '' },
  updatedby: String
}, { timestamps: true });
schema.index({ colid: 1, programcode: 1, level: 1 }, { unique: true });

module.exports = mongoose.model('crm2campusqueuelevel', schema);
