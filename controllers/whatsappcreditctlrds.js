const mongoose = require("mongoose");
const { SkillZoneCoupon } = require("../Models/skilldevelopmentzoneds");
const { WhatsappCreditAccount, WhatsappCreditPayment, WhatsappCreditTransaction } = require("../Models/whatsappcreditds");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RATE = 0.65;
const MIN_MESSAGES = 10000;
const KHARABILLU_COUPON = "kharabillu";
const isKharabillu = (couponcode) => text(couponcode).toLowerCase() === KHARABILLU_COUPON;

const validCouponQuery = (couponcode) => {
  const now = new Date();
  return {
    couponcode: new RegExp(`^${esc(couponcode)}$`, "i"),
    status: { $regex: /^active$/i },
    $and: [
      { $or: [{ fromdate: { $exists: false } }, { fromdate: null }, { fromdate: { $lte: now } }] },
      { $or: [{ todate: { $exists: false } }, { todate: null }, { todate: { $gte: now } }] }
    ]
  };
};

const computeQuote = async ({ units = 1, couponcode = "" }) => {
  const safeUnits = Math.max(1, Math.floor(num(units) || 1));
  const messages = safeUnits * MIN_MESSAGES;
  const originalamount = Number((messages * RATE).toFixed(2));
  let discountamount = 0;
  let coupon = null;
  if (text(couponcode)) {
    if (isKharabillu(couponcode)) {
      discountamount = Math.max(0, Number((originalamount - 1).toFixed(2)));
    } else {
      coupon = await SkillZoneCoupon.findOne(validCouponQuery(couponcode)).sort({ _id: -1 }).lean();
      if (!coupon) {
        const err = new Error("Coupon code is invalid or expired");
        err.status = 400;
        throw err;
      }
      discountamount = Math.min(originalamount, Math.max(0, num(coupon.discountamount)));
    }
  }
  const payableamount = Math.max(0, Number((originalamount - discountamount).toFixed(2)));
  return { units: safeUnits, messages, rate: RATE, originalamount, discountamount, payableamount, couponcode: text(couponcode).toUpperCase(), coupon };
};

const creditPaidPurchase = async ({ colid, sourceid = "", orderid = "", paidamount = 0, user = "", name = "", cashfreeorderid = "" }) => {
  const query = mongoose.Types.ObjectId.isValid(sourceid)
    ? { _id: sourceid, colid: num(colid) }
    : { colid: num(colid), orderid: text(orderid) };
  const payment = await WhatsappCreditPayment.findOne(query);
  if (!payment) return null;
  if (/^paid$/i.test(payment.paymentstatus)) return payment;
  payment.status = "Paid";
  payment.paymentstatus = "Paid";
  payment.paiddate = new Date();
  payment.refno = text(orderid || payment.orderid);
  payment.cashfreeorderid = text(cashfreeorderid);
  if (paidamount) payment.payableamount = paidamount;
  await payment.save();

  const account = await WhatsappCreditAccount.findOneAndUpdate(
    { colid: payment.colid },
    {
      $inc: { balance: payment.messages, totalpurchased: payment.messages },
      $set: { lastpurchasedat: new Date(), updatedby: text(user || payment.user) }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await WhatsappCreditTransaction.create({
    colid: payment.colid,
    type: "Credit",
    credits: payment.messages,
    balanceafter: account.balance,
    reason: "WhatsApp credits purchased",
    source: "WhatsappCredits",
    sourceid: String(payment._id),
    orderid: payment.orderid,
    user: text(user || payment.user),
    name: text(name || payment.name)
  });
  return payment;
};

exports.creditPaidPurchase = creditPaidPurchase;

exports.getBalance = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const account = await WhatsappCreditAccount.findOne({ colid }).lean();
    res.json({ success: true, data: account || { colid, balance: 0, totalpurchased: 0, totalused: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.quote = async (req, res) => {
  try {
    const quote = await computeQuote(req.body || req.query || {});
    res.json({ success: true, data: quote });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.preparePayment = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const quote = await computeQuote(req.body);
    const orderid = `WAC-${colid}-${Date.now()}`;
    const row = await WhatsappCreditPayment.create({
      colid,
      orderid,
      units: quote.units,
      messages: quote.messages,
      rate: quote.rate,
      originalamount: quote.originalamount,
      discountamount: quote.discountamount,
      payableamount: quote.payableamount,
      couponcode: quote.couponcode,
      user: text(req.body.user),
      name: text(req.body.name)
    });
    res.json({ success: true, data: row, quote });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.listPayments = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["orderid", "couponcode", "status", "paymentstatus"].forEach((field) => {
      const value = text(req.query[field] || req.body[field]);
      if (value) query[field] = { $regex: esc(value), $options: "i" };
    });
    const rows = await WhatsappCreditPayment.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    const account = await WhatsappCreditAccount.findOne({ colid }).lean();
    res.json({ success: true, data: rows, balance: account || { colid, balance: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTransactions = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await WhatsappCreditTransaction.find({ colid }).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
