const mongoose = require('mongoose');
const mapping = new mongoose.Schema({
  colid: { type: Number, required: true }, program: { type: String, required: true }, programcode: { type: String, required: true },
  counsellorname: String, counselloremail: { type: String, required: true, lowercase: true, trim: true },
  location: { type: String, default: '', trim: true },
  country: { type: String, default: '', trim: true }, state: { type: String, default: '', trim: true }, city: { type: String, default: '', trim: true }, createdby: String
}, { timestamps: true });
mapping.index({ colid: 1, programcode: 1, counselloremail: 1, location: 1, country: 1, state: 1, city: 1 }, { unique: true });
const assignment = new mongoose.Schema({
  colid: { type: Number, required: true }, leadid: { type: mongoose.Schema.Types.ObjectId, required: true },
  academicyear: { type: String, trim: true },
  active: { type: String, enum: ['Yes', 'No'], default: 'Yes' },
  admitted: { type: String, enum: ['Yes', 'No'], default: 'No' },
  program: { type: String, required: true }, programcode: { type: String, required: true }, mappingid: mongoose.Schema.Types.ObjectId,
  counsellorname: String, counselloremail: { type: String, required: true, lowercase: true, trim: true }, location: String,
  pipeline: String, case: String, followupdate: Date, assignedby: String, updatedby: String,
  interactions: [{ details: String, mode: String, pipeline: String, case: String, followupdate: Date, createdby: String, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });
assignment.index({ colid: 1, leadid: 1, academicyear: 1, programcode: 1 }, { unique: true });
assignment.index({ colid: 1, academicyear: 1, programcode: 1, updatedAt: -1 });
assignment.index({ colid: 1, counselloremail: 1, updatedAt: -1 });
module.exports = { Mapping: mongoose.model('crm2counsellorprogramds', mapping), Assignment: mongoose.model('crm2programleadds', assignment) };
