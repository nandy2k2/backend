const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;
function model(name, fields, indexes) {
  const schema = new mongoose.Schema(fields, { timestamps: true });
  for (const [index, options] of indexes) schema.index(index, options);
  return mongoose.models[name] || mongoose.model(name, schema);
}
const Campaign = model('crm2campaign', { colid: Number, name: String, namekey: String, description: String, owner: String }, [[{ colid: 1, owner: 1, namekey: 1 }, { unique: true }]]);
const Member = model('crm2campaignmember', { colid: Number, campaign: ObjectId, lead: ObjectId }, [[{ colid: 1, campaign: 1, lead: 1 }, { unique: true }]]);
const Run = model('crm2campaignrun', { colid: Number, campaign: ObjectId, owner: String, requestId: String, mode: String, subject: String, status: String, total: Number }, [[{ colid: 1, owner: 1, requestId: 1 }, { unique: true }], [{ colid: 1, campaign: 1, createdAt: -1 }]]);
const Delivery = model('crm2campaigndelivery', { colid: Number, campaign: ObjectId, run: ObjectId, lead: ObjectId, name: String, address: String, mode: String, status: String, sentat: Date, openedat: Date, clickedat: Date, token: String, links: [String], providerid: String, error: String }, [[{ token: 1 }, { unique: true, sparse: true }], [{ colid: 1, campaign: 1, createdAt: -1 }], [{ colid: 1, lead: 1, createdAt: -1 }]]);
const TrackingSettings = model('crm2emailtrackingsettings', { _id: Number, publicUrl: String, updatedby: String }, []);
module.exports = { Campaign, Member, Run, Delivery, TrackingSettings };
