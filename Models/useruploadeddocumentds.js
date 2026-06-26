const mongoose = require('mongoose');

const userUploadedDocumentSchema = new mongoose.Schema({
  colid: {
    type: Number,
    required: true
  },
  role: String,
  documentrequirementid: String,
  documentname: String,
  description: String,
  owneruser: String,
  ownername: String,
  uploadedby: String,
  awsconfigid: String,
  bucket: String,
  region: String,
  key: String,
  filename: String,
  originalname: String,
  mimetype: String,
  size: Number,
  url: String,
  status: {
    type: String,
    default: 'Uploaded'
  },
  remarks: String
}, { timestamps: true });

userUploadedDocumentSchema.index({ colid: 1, owneruser: 1, role: 1, documentname: 1 });

module.exports = mongoose.model('useruploadeddocumentds', userUploadedDocumentSchema);
