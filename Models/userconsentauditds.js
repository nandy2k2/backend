const mongoose = require('mongoose');

const userConsentAuditSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, trim: true, index: true },
  owneruser: { type: String, trim: true, index: true },
  ownername: { type: String, trim: true },
  action: { type: String, trim: true, index: true },
  status: { type: String, trim: true, index: true },
  contentid: { type: String, trim: true },
  title: { type: String, trim: true },
  content: String,
  comments: String,
  actoruser: { type: String, trim: true },
  actorname: { type: String, trim: true },
  ipaddress: { type: String, trim: true },
  useragent: { type: String, trim: true },
  activitytime: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

userConsentAuditSchema.index({ colid: 1, owneruser: 1, activitytime: -1 });

module.exports = mongoose.model('userconsentauditds', userConsentAuditSchema);
