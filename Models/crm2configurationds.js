const mongoose = require('mongoose');
const address = new mongoose.Schema({ colid: { type: Number, required: true }, country: { type: String, required: true }, state: { type: String, required: true }, city: { type: String, required: true }, countrykey: String, statekey: String, citykey: String, user: String }, { timestamps: true });
address.index({ colid: 1, countrykey: 1, statekey: 1, citykey: 1 }, { unique: true });
const mapping = new mongoose.Schema({ colid: { type: Number, required: true }, academicyear: { type: String, required: true }, program: String, programcode: { type: String, required: true }, formid: { type: String, required: true }, formtitle: String, user: String }, { timestamps: true });
mapping.index({ colid: 1, academicyear: 1, programcode: 1, formid: 1 }, { unique: true });
module.exports = {
  Address: mongoose.models.crm2addressmasterds || mongoose.model('crm2addressmasterds', address),
  FormMapping: mongoose.models.crm2programformmappingds || mongoose.model('crm2programformmappingds', mapping)
};
