const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true }, assignmentid: { type: mongoose.Schema.Types.ObjectId, required: true },
  leadid: mongoose.Schema.Types.ObjectId, studentid: mongoose.Schema.Types.ObjectId,
  regno: String, academicyear: String, program: String, programcode: String,
  meritpercentage: Number, createdby: String, feesdone: { type: Boolean, default: false }, scholarshipsdone: { type: Boolean, default: false },
  feeapplications: [{ sourceid: String, ledgerid: mongoose.Schema.Types.ObjectId, amount: Number }],
  scholarshipapplications: [{ sourceid: String, ledgerid: mongoose.Schema.Types.ObjectId, amount: Number }]
}, { timestamps: true });
schema.index({ colid: 1, assignmentid: 1 }, { unique: true });
schema.index({ colid: 1, leadid: 1 }, { unique: true });
schema.index({ colid: 1, regno: 1 }, { unique: true });
const counter = new mongoose.Schema({ colid: { type: Number, unique: true }, value: { type: Number, default: 0 } });
module.exports = { Admission: mongoose.model('crm2admissionds', schema), Counter: mongoose.model('crm2admissioncounterds', counter) };
