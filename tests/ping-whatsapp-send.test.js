const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../controllers/pingwhatsappsendctlrds');
const Config = require('../Models/pingwhatsappconfigds');
const Template = require('../Models/bhashwhatsapptemplateds');
const User = require('../Models/user');
const mongoose = require('mongoose');
const { WhatsappCreditAccount: Account, WhatsappCreditTransaction: Transaction } = require('../Models/whatsappcreditds');
const Log = mongoose.models.pingwhatsapplogds;
const originals = [Config.findOne, Template.findOne, User.find, Account.findOneAndUpdate, Transaction.create, Log.create, Log.updateOne, global.fetch];
afterEach(() => { [Config.findOne, Template.findOne, User.find, Account.findOneAndUpdate, Transaction.create, Log.create, Log.updateOne, global.fetch] = originals; });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } });
const id = '507f1f77bcf86cd799439011';
const req = () => ({ body: { colid: 42, configid: id, templateid: id, userids: [id], language: 'en', values: ['Prakash'] } });
function setup() {
  Config.findOne = query => { assert.equal(query.colid,42); return { lean: async () => ({ _id: id, phoneid: '001234', apiid: 'secret' }) }; };
  Template.findOne = query => { assert.equal(query.colid,42); assert.ok(query.provider.test('Ping')); assert.ok(!query.provider.test('BhashSMS')); return { lean: async () => ({ _id: id, templatecode: 'approved_template', noofvariables: 1 }) }; };
  User.find = query => { assert.equal(query.colid,42); return { select: () => ({ lean: async () => [{ _id:id, name:'Student', phone:'9008168822' }] }) }; };
  Log.create = async () => ({ _id: id }); Log.updateOne = async () => ({});
  Transaction.create = async () => ({});
}
test('builds documented text and optional image template payloads', () => {
  const base = { template: { templatecode:'hello', noofvariables:2 }, values:['A','B'] };
  const payload = controller.buildPayload(base,'919000000000');
  assert.equal(payload.template.name,'hello'); assert.equal(payload.template.language.code,'en');
  assert.deepEqual(payload.template.components[0].parameters,[{type:'text',text:'A'},{type:'text',text:'B'}]);
  const media = controller.buildPayload({ ...base, header:{type:'IMAGE',value:'https://example.com/a.png'} },'919000000000');
  assert.deepEqual(media.template.components[0],{type:'header',parameters:[{type:'image',image:{link:'https://example.com/a.png'}}]});
  assert.equal(controller.buildPayload({template:{templatecode:'zero',noofvariables:0}},'123').template.components,undefined);
  assert.throws(() => controller.buildPayload({...base,values:[]},'123'),/variables/);
});
test('uses configured phone ID and apikey; reserves credits before network call', async () => {
  setup(); let reserved = false;
  Account.findOneAndUpdate = async query => { assert.deepEqual(query,{colid:42,balance:{$gte:1}}); reserved=true; return {balance:9}; };
  global.fetch = async (url,options) => { assert.ok(reserved); assert.equal(url,'https://partnersv1.pinbot.ai/v3/001234/messages'); assert.equal(options.headers.apikey,'secret'); assert.equal(JSON.parse(options.body).to,'919008168822'); return {ok:true,json:async()=>({messages:[{id:'wamid.1'}]})}; };
  const res=response(); await controller.send(req(),res); assert.equal(res.code,200); assert.equal(res.data.sent,1); assert.equal(res.data.balance,9);
});
test('blocks sending without credit and refunds explicit provider rejection', async () => {
  setup(); global.fetch = async () => { throw new Error('Must not send'); };
  Account.findOneAndUpdate = async () => null;
  const blocked=response(); await controller.send(req(),blocked); assert.equal(blocked.code,402);
  let calls=0;
  Account.findOneAndUpdate = async (query,update) => { calls++; if(calls===2) assert.deepEqual(update.$inc,{balance:1,totalused:-1}); return {balance:calls===1?9:10}; };
  global.fetch = async () => ({ok:false,status:400,json:async()=>({error:{message:'Invalid template'}})});
  const rejected=response(); await controller.send(req(),rejected); assert.equal(rejected.data.failed,1); assert.equal(rejected.data.balance,10); assert.equal(calls,2);
});
test('rejects non-Ping templates before sending', async () => {
  setup(); Template.findOne = () => ({lean:async()=>null});
  const res=response(); await controller.send(req(),res); assert.equal(res.code,400); assert.match(res.data.error,/Ping template/);
});
test('direct Ping sends typed numbers without looking up users and deduplicates normalized numbers', async () => {
  setup();
  User.find = () => { throw new Error('Direct numbers must not query users'); };
  Account.findOneAndUpdate = async query => { assert.equal(query.balance.$gte,1); return {balance:9}; };
  let sends=0;
  global.fetch = async (url, options) => { sends++; assert.equal(JSON.parse(options.body).to,'919008168822'); return {ok:true,json:async()=>({messages:[{id:'wamid.direct'}]})}; };
  const request=req(); request.body.mobileNumbers='9008168822, +919008168822'; delete request.body.userids;
  const res=response(); await controller.sendDirect(request,res);
  assert.equal(res.code,200); assert.equal(res.data.sent,1); assert.equal(sends,1); assert.equal(res.data.recipients[1].status,'Skipped');
});
test('direct Ping rejects missing phone numbers', async () => {
  const res=response(); await controller.sendDirect(req(),res); assert.equal(res.code,400);
});
