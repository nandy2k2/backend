const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  startdate: { type: String, required: true }, enddate: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  finetype: { type: String, enum: ['per day','flat'], required: true }, user: String
}, { timestamps: true });
schema.index({ colid: 1, academicyear: 1, program: 1, programcode: 1 });
module.exports = mongoose.model('latefeepolicyds', schema);
