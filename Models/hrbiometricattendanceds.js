const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true },
  userid: { type: mongoose.Schema.Types.ObjectId, required: true },
  biometricid: { type: String, required: true },
  academicyear: { type: String, required: true },
  month: String, year: Number,
  date: { type: String, required: true },
  name: String, email: String, role: String,
  attendance: { type: Number, enum: [0, 1], required: true },
  intime: String, outtime: String,
  reason: String, monthlysalary: Number, deduction: Number,
  salaryid: mongoose.Schema.Types.ObjectId,
  ledgerid: mongoose.Schema.Types.ObjectId,
  user: String
}, { timestamps: true });
schema.index({ colid: 1, userid: 1, date: 1 }, { unique: true });
module.exports = mongoose.model('hrbiometricattendanceds', schema);
