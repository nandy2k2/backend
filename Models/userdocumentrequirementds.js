const mongoose = require('mongoose');

const userDocumentRequirementSchema = new mongoose.Schema({
  colid: {
    type: Number,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  documentname: {
    type: String,
    required: true
  },
  description: String,
  mandatory: {
    type: String,
    default: 'Yes'
  },
  status: {
    type: String,
    default: 'Active'
  },
  user: String
}, { timestamps: true });

userDocumentRequirementSchema.index({ colid: 1, role: 1, documentname: 1 }, { unique: true });

module.exports = mongoose.model('userdocumentrequirementds', userDocumentRequirementSchema);
