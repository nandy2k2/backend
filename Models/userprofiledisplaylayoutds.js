const mongoose = require('mongoose');

const userProfileDisplayLayoutSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true, default: 'Profile' },
  sectionorder: { type: Number, default: 0 },
  field: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  source: { type: String, enum: ['user', 'custom'], default: 'user' },
  order: { type: Number, default: 0 },
  visible: { type: String, default: 'Yes', trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

userProfileDisplayLayoutSchema.index({ colid: 1, role: 1, section: 1, field: 1 }, { unique: true });

module.exports = mongoose.model('userprofiledisplaylayoutds', userProfileDisplayLayoutSchema);
