const mongoose = require('mongoose');

const googleRegistrationLinkSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  role: { type: String, required: true },
  department: { type: String },
  designation: { type: String },
  token: { type: String, required: true, unique: true },
  url: { type: String },
  status: { type: String, default: 'Active' },
  createdby: { type: String },
  createdname: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('googleregistrationlinkds', googleRegistrationLinkSchema);
