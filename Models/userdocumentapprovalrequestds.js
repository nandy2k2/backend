const mongoose = require('mongoose');

const userDocumentApprovalRequestSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, trim: true },
  owneruser: { type: String, required: true, trim: true },
  ownername: { type: String, trim: true },
  documentid: { type: String, required: true },
  documentname: String,
  url: String,
  originalname: String,
  level: { type: Number, default: 1 },
  status: { type: String, default: 'Pending', index: true },
  comments: String,
  decisions: [{
    level: Number,
    action: String,
    comments: String,
    approvername: String,
    approveremail: String,
    date: Date
  }]
}, { timestamps: true });

userDocumentApprovalRequestSchema.index({ colid: 1, role: 1, owneruser: 1, status: 1 });

module.exports = mongoose.model('userdocumentapprovalrequestds', userDocumentApprovalRequestSchema);
