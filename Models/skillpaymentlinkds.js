const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  colid: { type: Number, required: true },
  studentid: { type: mongoose.Schema.Types.ObjectId, required: true },
  regno: String, email: String, student: String,
  amount: { type: Number, required: true },
  orderid: { type: String, required: true, unique: true },
  configid: { type: mongoose.Schema.Types.ObjectId, required: true },
  accessid: { type: mongoose.Schema.Types.ObjectId, required: true },
  accessfrom: Date, accesstill: Date
}, { timestamps: true });
module.exports = mongoose.models.skillpaymentlinkds || mongoose.model('skillpaymentlinkds', schema);
