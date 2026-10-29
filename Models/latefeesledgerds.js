const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  studentonlinepaymentid: { type: String, required: true }, policyid: { type: String, required: true },
  student: String, regno: { type: String, required: true }, email: String,
  academicyear: String, regulation: String, program: String, programcode: String, semester: String,
  startdate: String, enddate: String, finetype: String, rate: Number, days: Number,
  amount: Number, paid: Number, balance: { type: Number, default: 0 },
  refno: String, gatewayrefno: String, gateway: String, paiddate: Date,
  ledgerids: [String], status: { type: String, default: 'Paid' }
}, { timestamps: true });
schema.index({ colid: 1, studentonlinepaymentid: 1, policyid: 1 }, { unique: true });
module.exports = mongoose.model('latefeesledgerds', schema);
