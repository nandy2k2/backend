const mongoose = require('mongoose');

const studentCustomMenuSchema = new mongoose.Schema({
  colid: { type: Number, required: [true, 'Please enter colid'] },
  academicyear: { type: String, required: [true, 'Please enter academic year'] },
  program: { type: String },
  programcode: { type: String, required: [true, 'Please enter program code'] },
  menugroup: { type: String, required: [true, 'Please enter menu group'] },
  groupname: { type: String },
  title: { type: String, required: [true, 'Please enter title'] },
  path: { type: String, required: [true, 'Please enter path'] },
  order: { type: Number, default: 0 },
  user: { type: String },
  status1: { type: String, default: 'Active' },
  comments: { type: String, default: 'NA' }
}, { timestamps: true });

studentCustomMenuSchema.index({ colid: 1, academicyear: 1, programcode: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('studentcustommenuds', studentCustomMenuSchema);
