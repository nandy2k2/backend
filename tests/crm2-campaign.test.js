const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const nodemailer = require('nodemailer');
const Email = require('../Models/emailconfigurationds');
const Menu = require('../Models/menuaccessds');
const { Lead } = require('../Models/crm2ds');
const { Campaign, Member, Run, Delivery, TrackingSettings } = require('../Models/crm2campaignds');
const { metrics, emailContent, trackingOrigin } = require('../utils/crm2Campaign');
const router = require('../controllers/crm2campaignctlrds');
const id = '111111111111111111111111', leadId = '222222222222222222222222';
const lean = value => ({ lean: async () => value });
function signIn(t, role = 'Counsellor') {
  t.mock.method(jwt, 'verify', () => ({ colid: 42, user: 'staff@example.com' }));
  t.mock.method(User, 'findOne', () => ({ select: () => lean({ role }) }));
}
async function invoke(path, method, { body = {}, query = {}, params = {} } = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]);
  let status = 200, data;
  await route.route.stack[0].handle({ body, query, params, get: () => 'Bearer signed' }, { status(value) { status = value; return this; }, json(value) { data = value; } });
  return { status, data };
}
test('counsellors cannot read or work on another campaign and cannot override scope', async t => {
  signIn(t);
  const lookup = t.mock.method(Campaign, 'findOne', () => lean(null));
  const result = await invoke('/:id/members', 'get', { params: { id }, query: { colid: 999, owner: 'other@example.com' } });
  assert.equal(result.status, 400);
  assert.deepEqual(lookup.mock.calls[0].arguments[0], { _id: id, colid: 42, owner: 'staff@example.com' });
});
test('campaign membership upserts within institution and checks counsellor ownership', async t => {
  signIn(t);
  t.mock.method(Campaign, 'findOne', () => lean({ _id: id }));
  const scope = t.mock.method(Lead, 'distinct', async () => [leadId]);
  const bulk = t.mock.method(Member, 'bulkWrite', async () => ({ upsertedCount: 1 }));
  const result = await invoke('/:id/members', 'post', { params: { id }, body: { ids: [leadId, leadId] } });
  assert.equal(result.data.added, 1);
  assert.equal(scope.mock.calls[0].arguments[1].colid, 42);
  assert.equal(scope.mock.calls[0].arguments[1].counselloremail.source, '^staff@example\\.com$');
  assert.deepEqual(bulk.mock.calls[0].arguments[0][0].updateOne.filter, { colid: 42, campaign: id, lead: leadId });
  assert.equal((await invoke('/:id/members', 'post', { params: { id }, body: { ids: [leadId, id] } })).status, 400);
  assert.equal(bulk.mock.calls.length, 1);
});
test('send rechecks the assignment before creating a send run', async t => {
  signIn(t);
  t.mock.method(Campaign, 'findOne', () => lean({ _id: id }));
  t.mock.method(Run, 'init', async () => {});
  t.mock.method(Run, 'findOne', () => lean(null));
  t.mock.method(Member, 'distinct', async () => [leadId]);
  const lookup = t.mock.method(Lead, 'find', () => ({ select: () => lean([]) }));
  const send = t.mock.method(Run, 'create', async () => {});
  const result = await invoke('/:id/send', 'post', { params: { id }, body: { ids: [leadId], mode: 'Email', requestId: 'unique-request-1234' } });
  assert.equal(result.status, 400);
  assert.match(result.data.message, /no longer assigned/);
  assert.ok(lookup.mock.calls[0].arguments[0].counselloremail.test('staff@example.com'));
  assert.equal(send.mock.calls.length, 0);
});
test('email engagement is calculated only for sent, tracked email and links are escaped', () => {
  const rows = [{ mode: 'Email', status: 'Sent', token: 'a', openedat: new Date(), clickedat: new Date() }, { mode: 'Email', status: 'Sent', token: 'b' }, { mode: 'WhatsApp', status: 'Sent' }, { mode: 'Email', status: 'Unknown', token: 'c' }];
  assert.deepEqual(metrics(rows), { total: 4, sent: 3, failed: 0, unknown: 1, trackable: 2, opened: 1, clicked: 1, ctr: 50 });
  assert.equal(metrics([rows[2]]).ctr, null);
  const mail = emailContent('<script>\nVisit https://example.com/?a=1&b=2.', 'https://app.example', 'key');
  assert.deepEqual(mail.links, ['https://example.com/?a=1&b=2']);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /track\/key\/click\/0/);
  assert.match(mail.html, /track\/key\/open/);
  assert.match(mail.text, /track\/key\/click\/0/);
});

test('email sends through the scoped configured mailbox and logs the provider outcome', async t => {
  signIn(t, 'All');
  const tracking = t.mock.method(TrackingSettings, 'findById', () => ({ select: () => lean({ publicUrl: 'https://tracking.example.com' }) }));
  t.mock.method(Campaign, 'findOne', () => lean({ _id: id }));
  t.mock.method(Run, 'init', async () => {});
  t.mock.method(Run, 'findOne', () => lean(null));
  t.mock.method(Run, 'create', async row => ({ ...row, _id: id }));
  t.mock.method(Run, 'updateOne', async () => ({}));
  t.mock.method(Member, 'distinct', async () => [leadId]);
  t.mock.method(Lead, 'find', () => ({ select: () => lean([{ _id: leadId, name: 'Ann', email: 'ann@example.com' }]) }));
  const config = t.mock.method(Email, 'findOne', () => lean({ provider: 'Gmail', username: 'office@example.com', password: 'test', port: 587 }));
  t.mock.method(require('node:dns').promises, 'resolve4', async () => ['8.8.8.8']);
  const send = t.mock.fn(async () => ({ accepted: ['ann@example.com'], messageId: 'provider-id' }));
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: send }));
  t.mock.method(Delivery, 'insertMany', async rows => rows.map(row => ({ ...row, _id: leadId })));
  const update = t.mock.method(Delivery, 'updateOne', async () => ({}));
  const result = await invoke('/:id/send', 'post', { params: { id }, body: { ids: [leadId], mode: 'Email', mailType: 'legacy', configid: id, subject: 'New session', message: 'Hello', requestId: 'unique-request-1234' } });
  assert.equal(result.data.sent, 1);
  assert.equal(config.mock.calls[0].arguments[0].colid, 42);
  assert.equal(send.mock.calls[0].arguments[0].to, 'ann@example.com');
  assert.equal(tracking.mock.calls[0].arguments[0], 42);
  assert.match(send.mock.calls[0].arguments[0].html, /https:\/\/tracking\.example\.com\/api\/v2\/crm2-campaigns\/track\//);
  assert.equal(update.mock.calls[0].arguments[1].$set.providerid, 'provider-id');
});

test('tracking settings save a normalized HTTPS origin only for the signed-in institution', async t => {
  signIn(t, 'All');
  const save = t.mock.method(TrackingSettings, 'updateOne', async () => ({}));
  const result = await invoke('/tracking-settings', 'post', { body: { colid: 999, publicUrl: 'https://tracking.example.com/' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { publicUrl: 'https://tracking.example.com' });
  assert.deepEqual(save.mock.calls[0].arguments[0], { _id: 42 });
  assert.deepEqual(save.mock.calls[0].arguments[1].$set, { publicUrl: 'https://tracking.example.com', updatedby: 'staff@example.com' });
  assert.equal((await invoke('/tracking-settings', 'post', { body: { publicUrl: 'http://localhost:3000' } })).status, 400);
  assert.equal(save.mock.calls.length, 1);
  assert.equal(trackingOrigin(''), '');
  assert.throws(() => trackingOrigin('https://example.com/api'), /origin/);
  assert.throws(() => trackingOrigin('https://192.168.0.1'), /origin/);
});
test('campaign access does not allow a counsellor to change institution tracking settings', async t => {
  signIn(t);
  t.mock.method(Menu, 'exists', async () => null);
  const save = t.mock.method(TrackingSettings, 'updateOne', async () => ({}));
  assert.equal((await invoke('/tracking-settings', 'post', { body: { publicUrl: 'https://tracking.example.com' } })).status, 403);
  assert.equal(save.mock.calls.length, 0);
});
