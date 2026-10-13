const mongoose = require("mongoose");

const WhatsappCreditAccountSchema = new mongoose.Schema({
  colid: { type: Number, required: true, unique: true, index: true },
  balance: { type: Number, default: 0 },
  totalpurchased: { type: Number, default: 0 },
  totalused: { type: Number, default: 0 },
  lastpurchasedat: Date,
  updatedby: { type: String, trim: true, default: "" }
}, { timestamps: true });

const WhatsappCreditPaymentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  orderid: { type: String, trim: true, index: true },
  units: { type: Number, default: 1 },
  messages: { type: Number, default: 10000 },
  rate: { type: Number, default: 0.65 },
  originalamount: { type: Number, default: 0 },
  discountamount: { type: Number, default: 0 },
  payableamount: { type: Number, default: 0 },
  couponcode: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Pending", index: true },
  paymentstatus: { type: String, trim: true, default: "Pending", index: true },
  paiddate: Date,
  cashfreeorderid: { type: String, trim: true, default: "" },
  refno: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" }
}, { timestamps: true });

const WhatsappCreditTransactionSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  type: { type: String, trim: true, enum: ["Credit", "Debit"], default: "Debit", index: true },
  credits: { type: Number, default: 0 },
  balanceafter: { type: Number, default: 0 },
  reason: { type: String, trim: true, default: "" },
  source: { type: String, trim: true, default: "" },
  sourceid: { type: String, trim: true, default: "" },
  orderid: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" }
}, { timestamps: true });

WhatsappCreditPaymentSchema.index({ colid: 1, orderid: 1 });
WhatsappCreditTransactionSchema.index({ colid: 1, createdAt: -1 });

module.exports = {
  WhatsappCreditAccount: mongoose.models.whatsappcreditaccountds || mongoose.model("whatsappcreditaccountds", WhatsappCreditAccountSchema),
  WhatsappCreditPayment: mongoose.models.whatsappcreditpaymentds || mongoose.model("whatsappcreditpaymentds", WhatsappCreditPaymentSchema),
  WhatsappCreditTransaction: mongoose.models.whatsappcredittransactionds || mongoose.model("whatsappcredittransactionds", WhatsappCreditTransactionSchema)
};
