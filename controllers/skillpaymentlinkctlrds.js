const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');
const User = require('../Models/user');
const Config = require('../Models/cashfreeconfigds');
const Log = require('../Models/cashfreepaymentlogds');
const Payment = require('../Models/skillpaymentlinkds');
const { SkillZoneAccess: Access } = require('../Models/skilldevelopmentzoneds');
const router = express.Router();
const text = value => String(value ?? '').trim();
function paymentContact(body) {
  const email = text(body.email) || 'nandy2k2@gmail.com';
  const phone = text(body.phone || body.phonenumber) || '9008168822';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid payment email');
  if (!/^\+?\d{10,15}$/.test(phone)) throw new Error('Enter a valid payment phone number (10 to 15 digits)');
  return { email, phone };
}
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
function validate(body) {
  const colid = Number(body.colid), amount = Number(body.amount);
  if (!Number.isInteger(colid) || colid <= 0 || !text(body.regno)) throw new Error('Valid colid and regno are required');
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw new Error('Amount must be between INR 1 and 1000000, with at most two decimals');
  const origin = new URL(body.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid return origin');
  return { colid, amount, origin: origin.origin };
}
async function gateway(config, path, body) {
  const base = config.environment === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', 'x-client-id': config.appid, 'x-client-secret': config.secretkey, 'x-api-version': config.apiVersion || '2023-08-01' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Cashfree request failed');
  return data;
}
const wrap = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await fn(req, res); } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
router.post('/start', wrap(async (req, res) => {
  const { colid, amount, origin } = validate(req.body);
  const contact = paymentContact(req.body);
  const students = await User.find({ colid, regno: text(req.body.regno), role: 'Student' }).select('name email phone regno').limit(2).lean();
  if (students.length !== 1) throw new Error('Student not found or regno is duplicated in this institution');
  const student = students[0];
  const config = await Config.findOne({ colid, isactive: true, $or: [{ configscope: 'Admin' }, { configscope: { $exists: false } }, { configscope: '' }] }).sort({ updatedAt: -1 }).lean();
  if (!config) throw new Error('Active admin Cashfree configuration is required');
  if (!student.email) throw new Error('Student email must be saved in User master for Skill Development access');
  const token = crypto.randomBytes(32).toString('hex');
  const orderid = `SKLINK-${crypto.randomBytes(16).toString('hex')}`;
  const payment = await Payment.create({ token, orderid, colid, amount, studentid: student._id, regno: student.regno, email: student.email.toLowerCase(), student: student.name, configid: config._id, accessid: new mongoose.Types.ObjectId() });
  const data = await gateway(config, '/orders', {
    order_id: orderid, order_amount: amount, order_currency: 'INR',
    customer_details: { customer_id: String(student._id), customer_name: student.name, customer_email: contact.email, customer_phone: contact.phone },
    order_note: 'Skill Development - one month access',
    order_meta: { return_url: `${origin}/skill-development-payment-link?token=${token}` }
  });
  if (!data.payment_session_id) throw new Error('Cashfree did not return a payment session');
  await Log.create({ colid, orderid, amount, originalamount: amount, configid: String(config._id), configscope: 'Admin', environment: config.environment, source: 'SkillDevelopmentPaymentLink', sourceid: String(payment._id), regno: student.regno, customername: student.name, customeremail: contact.email, customerphone: contact.phone, paymentsessionid: data.payment_session_id, cashfreeorderid: String(data.cf_order_id || ''), status: data.order_status || 'ACTIVE', gatewayresponse: data });
  res.json({ success: true, token, sessionid: data.payment_session_id, mode: config.environment });
}));
router.post('/verify', wrap(async (req, res) => {
  const token = text(req.body.token);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid payment token');
  const payment = await Payment.findOne({ token }).lean();
  if (!payment) throw new Error('Payment link not found');
  const config = await Config.findOne({ _id: payment.configid, colid: payment.colid }).lean();
  if (!config) throw new Error('Cashfree configuration not found');
  const data = await gateway(config, `/orders/${encodeURIComponent(payment.orderid)}`);
  if (data.order_id !== payment.orderid || data.order_currency !== 'INR' || Number(data.order_amount) !== payment.amount) throw new Error('Cashfree order details do not match');
  if (data.order_status !== 'PAID') return res.json({ success: true, paid: false, status: data.order_status, message: 'Payment is not successful yet. No access has been granted.' });
  const start = new Date(), end = new Date(start); end.setMonth(end.getMonth() + 1);
  // First verification fixes the access window; retries cannot extend it.
  const fixed = await Payment.findOneAndUpdate({ _id: payment._id, accessfrom: null }, { $set: { accessfrom: start, accesstill: end } }, { new: true }).lean() || await Payment.findById(payment._id).lean();
  await Access.updateOne({ _id: payment.accessid }, { $setOnInsert: { colid: payment.colid, email: payment.email, regno: payment.regno, student: payment.student, orderid: payment.orderid, amount: payment.amount, originalamount: payment.amount, paymentstatus: 'Paid', accessfrom: fixed.accessfrom, accesstill: fixed.accesstill } }, { upsert: true });
  await Log.updateOne({ colid: payment.colid, orderid: payment.orderid }, { $set: { status: 'PAID', paymentstatus: 'Paid', paidamount: payment.amount, paiddate: fixed.accessfrom, verifyresponse: data } });
  res.json({ success: true, paid: true, accesstill: fixed.accesstill, message: 'Payment successful. Skill Development access is active. Please logout and login again.' });
}));
module.exports = { router, validate, exact, paymentContact };
