const mongoose = require('mongoose');

const userProfileLayoutSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, required: true, trim: true },
  field: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  source: { type: String, enum: ['user', 'custom'], default: 'user' },
  tab: { type: String, default: 'Profile', trim: true },
  taborder: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  editable: { type: String, default: 'No', trim: true },
  visible: { type: String, default: 'Yes', trim: true },
  type: { type: String, default: 'text', trim: true },
  options: [String],
  user: { type: String, trim: true }
}, { timestamps: true });

userProfileLayoutSchema.index({ colid: 1, role: 1, field: 1 }, { unique: true });

module.exports = mongoose.model('userprofilelayoutds', userProfileLayoutSchema);
