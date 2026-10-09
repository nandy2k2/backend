const mongoose = require("mongoose");

const cashfreePaymentLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  orderid: { type: String, required: true, trim: true, index: true },
  cashfreeorderid: { type: String, trim: true, default: "" },
  paymentsessionid: { type: String, trim: true, default: "" },
  amount: { type: Number, default: 0 },
  currency: { type: String, trim: true, default: "INR" },
  status: { type: String, trim: true, default: "CREATED", index: true },
  paymentstatus: { type: String, trim: true, default: "Initiated" },
  customername: { type: String, trim: true, default: "" },
  customeremail: { type: String, trim: true, default: "" },
  customerphone: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, default: "" },
  configid: { type: String, trim: true, default: "" },
  configscope: { type: String, trim: true, default: "Admin", index: true },
  source: { type: String, trim: true, default: "" },
  sourceid: { type: String, trim: true, default: "" },
  studentonlinepaymentid: { type: String, trim: true, default: "" },
  regno: { type: String, trim: true, default: "" },
  feeitem: { type: String, trim: true, default: "" },
  environment: { type: String, trim: true, default: "sandbox" },
  paymentlink: { type: String, trim: true, default: "" },
  paidamount: { type: Number, default: 0 },
  paiddate: { type: Date },
  gatewayrefno: { type: String, trim: true, default: "" },
  requestpayload: { type: Object, default: {} },
  gatewayresponse: { type: Object, default: {} },
  verifyresponse: { type: Object, default: {} },
  callbackresponse: { type: Object, default: {} },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" }
}, { timestamps: true });

cashfreePaymentLogSchema.index({ colid: 1, orderid: 1 }, { unique: true });
cashfreePaymentLogSchema.index({ colid: 1, createdAt: -1 });

module.exports = mongoose.models.cashfreepaymentlogds || mongoose.model("cashfreepaymentlogds", cashfreePaymentLogSchema);
