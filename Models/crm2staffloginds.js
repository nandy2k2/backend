const mongoose = require('mongoose');
const schema = new mongoose.Schema({ colid: Number, email: String, tokenhash: { type: String, unique: true }, loggedAt: { type: Date, default: Date.now } });
schema.index({ colid: 1, email: 1, loggedAt: -1 });
module.exports = mongoose.models.crm2staffloginds || mongoose.model('crm2staffloginds', schema);
