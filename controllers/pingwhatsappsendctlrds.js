const mongoose = require('mongoose');
const Config = require('../Models/pingwhatsappconfigds');
const Template = require('../Models/bhashwhatsapptemplateds');
const User = require('../Models/user');
const { WhatsappCreditAccount: Account, WhatsappCreditTransaction: Transaction } = require('../Models/whatsappcreditds');
const Log = mongoose.models.pingwhatsapplogds || mongoose.model('pingwhatsapplogds', new mongoose.Schema({
  colid: { type: Number, required: true, index: true }, configid: mongoose.Schema.Types.ObjectId,
  templateid: mongoose.Schema.Types.ObjectId, template: String, user: String,
  recipients: [mongoose.Schema.Types.Mixed], status: String
}, { timestamps: true }));
const scope = req => {
  const colid = Number(req.user?.colid || req.body?.colid || req.query?.colid);
  if (!Number.isFinite(colid) || colid <= 0) throw new Error('Institution ID is required');
  return colid;
};
const pingTemplates = colid => ({ colid, provider: /^Ping$/i, active: /^Yes$/i });
function buildPayload({ template, language = 'en', values = [], header }, to) {
  if (!/^[a-z]{2,3}(?:_[A-Za-z]{2,4})?$/.test(language)) throw new Error('Enter a valid template language code');
  if (!Array.isArray(values) || values.length !== Number(template.noofvariables || 0) || values.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Fill all template variables in order');
  const components = [];
  if (header?.type) {
    const type = String(header.type).toLowerCase();
    if (!['text', 'image', 'video', 'document'].includes(type) || !header.value?.trim()) throw new Error('Invalid template header');
    if (type !== 'text' && !/^https?:\/\//i.test(header.value)) throw new Error('Header media must be an HTTP(S) link');
    components.push({ type: 'header', parameters: [type === 'text' ? { type, text: header.value } : { type, [type]: { link: header.value } }] });
  }
  if (values.length) components.push({ type: 'body', parameters: values.map(text => ({ type: 'text', text })) });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name: template.templatecode, language: { code: language }, ...(components.length ? { components } : {}) } };
}
exports.buildPayload = buildPayload;
exports.options = async (req, res) => {
  try {
    const colid = scope(req);
    const configs = await Config.find({ colid, active: 'Yes' }).select('_id phoneid').lean();
    const templates = await Template.find(pingTemplates(colid)).select('_id templatename templatecode noofvariables variablenames').lean();
    const account = await Account.findOne({ colid }).lean();
    res.json({ configs, templates, balance: account?.balance || 0 });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
const send = async (req, res, direct = false) => {
  try {
    const colid = scope(req), body = req.body;
    const ids = [...new Set(Array.isArray(body.userids) ? body.userids : [])];
    const numbers = typeof body.mobileNumbers === 'string' ? body.mobileNumbers.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean) : [];
    if ((!direct && (!ids.length || ids.length > 10 || ids.some(id => !mongoose.isValidObjectId(id)))) || (direct && (!numbers.length || numbers.length > 10)) || !mongoose.isValidObjectId(body.configid) || !mongoose.isValidObjectId(body.templateid)) throw new Error('Select configuration, template and 1-10 recipients per batch');
    const config = await Config.findOne({ _id: body.configid, colid, active: 'Yes' }).lean();
    const template = await Template.findOne({ _id: body.templateid, ...pingTemplates(colid) }).lean();
    if (!config?.phoneid || !config.apiid || !template) throw new Error('Active Ping configuration or Ping template not found');
    buildPayload({ ...body, template }, '919000000000');
    const users = direct ? numbers.map(phone => ({ phone })) : await User.find({ colid, _id: { $in: ids } }).select('_id name email phone').lean();
    if (!direct && users.length !== ids.length) throw new Error('Selected users do not belong to this institution');
    const seen = new Set();
    const recipients = users.map(user => {
      let phone = String(user.phone || '').replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      const error = !/^[1-9]\d{7,14}$/.test(phone) ? 'Invalid phone number' : seen.has(phone) ? 'Duplicate phone number in batch' : '';
      seen.add(phone);
      return { userid: user._id, name: user.name, phone, status: error ? 'Skipped' : 'Pending', error };
    });
    const count = recipients.filter(row => row.status === 'Pending').length;
    if (!count) throw new Error('No valid unique recipient phone numbers');
    const log = await Log.create({ colid, configid: config._id, templateid: template._id, template: template.templatecode, user: body.user, recipients, status: 'Processing' });
    const account = await Account.findOneAndUpdate({ colid, balance: { $gte: count } }, { $inc: { balance: -count, totalused: count } }, { new: true });
    if (!account) {
      await Log.updateOne({ _id: log._id, colid }, { $set: { status: 'Insufficient credits' } });
      return res.status(402).json({ error: `Insufficient WhatsApp credits. Required: ${count}.` });
    }
    try {
      await Transaction.create({ colid, type: 'Debit', credits: count, balanceafter: account.balance, reason: 'Ping WhatsApp messages reserved', source: 'send-whatsapp-ping', sourceid: String(log._id), user: body.user });
    } catch (error) {
      await Account.updateOne({ colid }, { $inc: { balance: count, totalused: -count } });
      throw error;
    }
    let failed = 0;
    // A timeout has an unknown delivery outcome; never retry it automatically.
    await Promise.all(recipients.filter(row => row.status === 'Pending').map(async row => {
      try {
        const response = await fetch(`https://partnersv1.pinbot.ai/v3/${encodeURIComponent(config.phoneid)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.apiid },
          body: JSON.stringify(buildPayload({ ...body, template }, row.phone)), signal: AbortSignal.timeout(30000)
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data?.messages?.[0]?.id) { row.status = 'Accepted'; row.messageid = data.messages[0].id; }
        else if (!response.ok && response.status < 500) { row.status = 'Failed'; row.error = String(data?.error?.message || `Ping rejected request (${response.status})`).slice(0, 500); failed++; }
        else { row.status = 'Unknown'; row.error = 'Provider acceptance could not be confirmed. Check Ping before resending.'; }
      } catch (error) { row.status = 'Unknown'; row.error = 'Connection interrupted. Check Ping before resending.'; }
    }));
    let balance = account.balance;
    if (failed) {
      const refunded = await Account.findOneAndUpdate({ colid }, { $inc: { balance: failed, totalused: -failed } }, { new: true });
      balance = refunded.balance;
      await Transaction.create({ colid, type: 'Credit', credits: failed, balanceafter: balance, reason: 'Ping rejected messages refunded', source: 'send-whatsapp-ping', sourceid: String(log._id), user: body.user });
    }
    await Log.updateOne({ _id: log._id, colid }, { $set: { recipients, status: 'Completed' } });
    res.json({ recipients, balance, sent: recipients.filter(row => row.status === 'Accepted').length, failed, unknown: recipients.filter(row => row.status === 'Unknown').length });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
exports.send = (req, res) => send(req, res);
exports.sendDirect = (req, res) => send(req, res, true);
