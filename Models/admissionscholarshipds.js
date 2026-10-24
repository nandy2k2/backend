const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  scholarship: { type: String, required: true, trim: true }, description: String,
  academicyear: { type: String, trim: true },
  program: { type: String, required: true }, programcode: { type: String, required: true },
  value: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ['Amount', 'Percentage'], required: true },
  category: { type: String, enum: ['General', 'SC', 'ST', 'OBC', 'All'], default: 'All' },
  merit: { type: String, enum: ['Yes', 'No'], default: 'No' },
  meritpercentage: { type: Number, min: 0, max: 100, default: 0 },
  gender: { type: String, enum: ['Male', 'Female', 'All'], default: 'All' },
  active: { type: String, enum: ['Yes', 'No'], default: 'Yes' }, user: String
}, { timestamps: true });
module.exports = mongoose.model('admissionscholarshipds', schema);
