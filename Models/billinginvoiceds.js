const mongoose = require("mongoose");

const BillingInvoiceSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: String,
  username: String,
  item: { type: String, trim: true },
  fromdate: Date,
  todate: Date,
  amount: { type: Number, default: 0 },
  gst: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  filelink: String,
  filename: String,
  status: { type: String, enum: ["Pending", "Paid"], default: "Pending", index: true },
  paidamount: { type: Number, default: 0 },
  tdsdeducted: { type: Number, default: 0 },
  tdspaiddate: Date,
  paiddate: Date,
  paidaccount: String,
  refno: String,
  paymode: String,
  remarks: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

BillingInvoiceSchema.index({ colid: 1, status: 1, fromdate: -1 });

module.exports = mongoose.model("billinginvoiceds", BillingInvoiceSchema);
