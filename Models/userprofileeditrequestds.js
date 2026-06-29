const mongoose = require('mongoose');

const profileEditFieldSchema = new mongoose.Schema({
  field: String,
  label: String,
  oldvalue: mongoose.Schema.Types.Mixed,
  newvalue: mongoose.Schema.Types.Mixed,
  level: { type: Number, default: 1 },
  status: { type: String, default: 'Pending' },
  comments: String,
  decisions: [{
    level: Number,
    action: String,
    comments: String,
    approvername: String,
    approveremail: String,
    date: Date
  }]
}, { _id: false });

const userProfileEditRequestSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  role: { type: String, trim: true },
  owneruser: { type: String, required: true, trim: true },
  ownername: { type: String, trim: true },
  submittedby: { type: String, trim: true },
  status: { type: String, default: 'Pending', index: true },
  fields: [profileEditFieldSchema]
}, { timestamps: true });

userProfileEditRequestSchema.index({ colid: 1, role: 1, owneruser: 1, status: 1 });

module.exports = mongoose.model('userprofileeditrequestds', userProfileEditRequestSchema);
