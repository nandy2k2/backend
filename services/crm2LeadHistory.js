const mongoose = require('mongoose');
const schema = new mongoose.Schema({ colid: Number, leadid: mongoose.Schema.Types.ObjectId, order: Number, actor: String, actorname: String, source: String, name: String, email: String, phone: String, matchedby: [String], messageid: String }, { timestamps: true });
schema.index({ colid: 1, leadid: 1, order: 1 }, { unique: true });
const History = mongoose.models.crm2inputhistory || mongoose.model('crm2inputhistory', schema);
const Counter = mongoose.models.crm2historycounter || mongoose.model('crm2historycounter', new mongoose.Schema({ _id: String, value: Number }));
const emailKey = value => String(value || '').trim().toLowerCase();
const phoneKey = value => String(value || '').replace(/\D/g, '');
async function recordDuplicate(lead, input, actor, source) {
  let counter;
  try { counter = await Counter.findOneAndUpdate({ _id: `${lead.colid}:${lead._id}` }, { $inc: { value: 1 } }, { upsert: true, new: true }); }
  catch (err) { if (err.code !== 11000) throw err; counter = await Counter.findOneAndUpdate({ _id: `${lead.colid}:${lead._id}` }, { $inc: { value: 1 } }, { new: true }); }
  return History.create({ colid: lead.colid, leadid: lead._id, order: counter.value, actor: actor?.email || actor || '', actorname: actor?.name || '', source, name: input.name || lead.name || '', email: emailKey(input.email), phone: String(input.phone || ''), messageid: input.messageid || '', matchedby: [emailKey(lead.email) === emailKey(input.email) && 'Email', phoneKey(lead.phone) === phoneKey(input.phone) && 'Phone'].filter(Boolean) });
}
module.exports = { History, recordDuplicate, emailKey, phoneKey };
