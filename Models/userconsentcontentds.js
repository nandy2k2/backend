const mongoose = require('mongoose');

const userConsentContentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, required: true, trim: true, index: true },
  title: { type: String, trim: true, default: 'Data processing consent' },
  content: { type: String, trim: true },
  status: { type: String, trim: true, default: 'Active', index: true },
  user: { type: String, trim: true }
}, { timestamps: true });

userConsentContentSchema.index({ colid: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('userconsentcontentds', userConsentContentSchema);
