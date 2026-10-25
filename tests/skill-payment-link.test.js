const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { router, validate, paymentContact } = require('../controllers/skillpaymentlinkctlrds');
const Payment = require('../Models/skillpaymentlinkds');
const Config = require('../Models/cashfreeconfigds');
const Log = require('../Models/cashfreepaymentlogds');
const { SkillZoneAccess: Access } = require('../Models/skilldevelopmentzoneds');
const originals = [];
test('payment contact supports query values and independent defaults', () => {
  assert.deepEqual(paymentContact({}), { email: 'nandy2k2@gmail.com', phone: '9008168822' });
  assert.deepEqual(paymentContact({ email: 'student@example.com' }), { email: 'student@example.com', phone: '9008168822' });
  assert.deepEqual(paymentContact({ phone: '9876543210' }), { email: 'nandy2k2@gmail.com', phone: '9876543210' });
  assert.deepEqual(paymentContact({ email: 'student@example.com', phonenumber: '9876543210' }), { email: 'student@example.com', phone: '9876543210' });
  assert.throws(() => paymentContact({ email: 'bad' }));
  assert.throws(() => paymentContact({ phone: 'bad' }));
});
function stub(object, key, value) { originals.push([object, key, object[key]]); object[key] = value; }
afterEach(() => { while (originals.length) { const [object, key, value] = originals.pop(); object[key] = value; } });
test('validates institution, student identity, amount precision and return origin', () => {
  assert.equal(validate({ colid: 1, regno: 'R1', amount: '600', origin: 'https://example.com/path' }).origin, 'https://example.com');
  for (const amount of [0, -1, 'NaN', '600.001', 1000001]) assert.throws(() => validate({ colid: 1, regno: 'R1', amount, origin: 'https://example.com' }));
  assert.throws(() => validate({ colid: 1, amount: 600, origin: 'https://example.com' }));
  assert.throws(() => validate({ colid: 1, regno: 'R1', amount: 600, origin: 'javascript:alert(1)' }));
});
async function verify(gateway, fixed = false) {
  const payment = { _id: 'payment', token: 'a'.repeat(64), colid: 1, orderid: 'ORDER', amount: 600, configid: 'config', accessid: 'access', email: 'student@example.com', regno: 'R1', student: 'Student', accessfrom: new Date('2026-10-25'), accesstill: new Date('2026-11-25') };
  const query = value => ({ lean: async () => value });
  const accessWrites = [], logs = [];
  stub(Payment, 'findOne', () => query(payment));
  stub(Payment, 'findOneAndUpdate', () => query(fixed ? null : payment));
  stub(Payment, 'findById', () => query(payment));
  stub(Config, 'findOne', filter => { assert.equal(filter.colid, 1); return query({ environment: 'sandbox' }); });
  stub(Access, 'updateOne', async (...args) => accessWrites.push(args));
  stub(Log, 'updateOne', async (...args) => logs.push(args));
  stub(global, 'fetch', async () => ({ ok: true, json: async () => gateway }));
  const response = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  const handler = router.stack.find(layer => layer.route.path === '/verify').route.stack[0].handle;
  await handler({ body: { token: payment.token } }, response);
  return { response, accessWrites, logs, payment };
}
test('pending payment never grants access', async () => {
  const result = await verify({ order_id: 'ORDER', order_currency: 'INR', order_amount: 600, order_status: 'ACTIVE' });
  assert.equal(result.response.data.paid, false); assert.equal(result.accessWrites.length, 0);
});
test('mismatching amount never grants access', async () => {
  const result = await verify({ order_id: 'ORDER', order_currency: 'INR', order_amount: 1, order_status: 'PAID' });
  assert.equal(result.response.code, 400); assert.equal(result.accessWrites.length, 0);
});
test('verified payment grants one month with insert-only access and stable retry dates', async () => {
  const result = await verify({ order_id: 'ORDER', order_currency: 'INR', order_amount: 600, order_status: 'PAID' }, true);
  assert.equal(result.response.data.paid, true);
  assert.equal(result.accessWrites[0][0]._id, 'access');
  const insert = result.accessWrites[0][1].$setOnInsert;
  assert.equal(insert.colid, 1); assert.equal(insert.regno, 'R1'); assert.equal(insert.email, 'student@example.com');
  assert.equal(insert.accesstill, result.payment.accesstill);
  assert.match(result.response.data.message, /logout and login again/);
});
