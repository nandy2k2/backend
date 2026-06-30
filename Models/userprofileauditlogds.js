const mongoose = require('mongoose');

const userProfileAuditLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  action: { type: String, trim: true, index: true },
  requesttype: { type: String, trim: true, index: true },
  role: { type: String, trim: true },
  owneruser: { type: String, trim: true, index: true },
  ownername: { type: String, trim: true },
  actorname: { type: String, trim: true },
  actoremail: { type: String, trim: true, index: true },
  actorrole: { type: String, trim: true },
  ipaddress: { type: String, trim: true },
  field: { type: String, trim: true },
  label: { type: String, trim: true },
  oldvalue: mongoose.Schema.Types.Mixed,
  newvalue: mongoose.Schema.Types.Mixed,
  status: { type: String, trim: true, index: true },
  comments: String,
  requestid: { type: String, trim: true },
  activitytime: { type: Date, default: Date.now, index: true },
  details: mongoose.Schema.Types.Mixed
}, { timestamps: true });

userProfileAuditLogSchema.index({ colid: 1, requesttype: 1, action: 1, activitytime: -1 });

module.exports = mongoose.model('userprofileauditlogds', userProfileAuditLogSchema);
