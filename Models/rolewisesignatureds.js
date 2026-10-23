const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, required: true, trim: true, lowercase: true },
  signaturelink: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  remarks: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });
schema.index({ colid: 1, role: 1 }, { unique: true });
module.exports = mongoose.model('rolewisesignatureds', schema);
