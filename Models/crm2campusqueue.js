const mongoose = require('mongoose');
const oid = mongoose.Schema.Types.ObjectId;
function model(name, fields, indexes = []) {
  const schema = new mongoose.Schema(fields, { timestamps: true });
  for (const key of indexes) schema.index(key, { unique: true });
  return mongoose.model(name, schema);
}
const Counter = model('crm2queuecounter', { colid: Number, levelid: oid, number: String, active: String }, [{ colid: 1, levelid: 1, number: 1 }]);
const Booking = model('crm2queuebooking', { colid: Number, levelid: oid, counterid: oid, userid: oid, day: String }, [{ colid: 1, counterid: 1, day: 1 }, { colid: 1, levelid: 1, day: 1 }]);
const Token = model('crm2queuetoken', {
  colid: Number, programcode: String, program: String, day: String, number: Number, leadid: oid, lead: String,
  levelid: oid, level: Number, title: String, status: String, claimedby: oid, counter: String
}, [{ colid: 1, programcode: 1, day: 1, number: 1 }, { colid: 1, programcode: 1, day: 1, leadid: 1 }]);
Token.schema.index({ colid: 1, day: 1, levelid: 1, status: 1 });
const Sequence = model('crm2queuesequence', { _id: String, value: Number });
module.exports = { Counter, Booking, Token, Sequence };
