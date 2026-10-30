const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  phoneid: { type: String, required: true, trim: true },
  apiid: { type: String, required: true, trim: true },
  active: { type: String, enum: ['Yes','No'], default: 'Yes' },
  user: String
}, { timestamps: true });
schema.index({ colid: 1, phoneid: 1 }, { unique: true });
module.exports = mongoose.model('pingwhatsappconfigds', schema);
