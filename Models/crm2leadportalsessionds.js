const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tokenhash: { type: String, required: true, unique: true },
  leadid: { type: mongoose.Schema.Types.ObjectId, required: true },
  colid: { type: Number, required: true },
  credentialhash: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.models.crm2leadportalsessionds || mongoose.model('crm2leadportalsessionds', schema);
