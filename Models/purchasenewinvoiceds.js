const mongoose = require("mongoose");

const purchaseNewInvoiceSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  invoiceid: { type: String, required: true, trim: true, index: true },
  invoiceno: { type: String, trim: true, default: "" },
  invoicedate: { type: Date, default: Date.now },
  po: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewpurchaseorderds", required: true, index: true },
  poid: { type: String, trim: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewvendords" },
  vendorname: { type: String, trim: true, default: "" },
  vendorusername: { type: String, trim: true, index: true },
  items: [{
    itemindex: Number,
    item: String,
    quantity: Number,
    unitprice: Number,
    gstpercent: Number,
    gstamount: Number,
    total: Number
  }],
  subtotal: { type: Number, default: 0 },
  gsttotal: { type: Number, default: 0 },
  grandtotal: { type: Number, default: 0 },
  paymode: { type: String, trim: true, default: "" },
  bankdetails: { type: String, trim: true, default: "" },
  paymentmode: { type: String, trim: true, default: "" },
  paymentvoucherid: { type: String, trim: true, default: "", index: true },
  paymentvoucherdate: { type: Date },
  paymentvoucherstatus: { type: String, trim: true, default: "" },
  paidamount: { type: Number, default: 0 },
  paymentdate: { type: Date },
  bankaccount: { type: String, trim: true, default: "" },
  ifsc: { type: String, trim: true, default: "" },
  beneficiary: { type: String, trim: true, default: "" },
  paymentrefno: { type: String, trim: true, default: "" },
  paymentstatus: { type: String, trim: true, default: "" },
  paymentremarks: { type: String, trim: true, default: "" },
  remarks: { type: String, trim: true, default: "" },
  documents: [{
    documenttype: String,
    description: String,
    filename: String,
    url: String,
    key: String,
    uploadedat: { type: Date, default: Date.now }
  }],
  status: { type: String, trim: true, default: "Draft", index: true },
  stage: { type: String, trim: true, default: "Draft" },
  currentlevel: { type: Number, default: 0 },
  approvedat: { type: Date },
  blockchainhash: { type: String, trim: true, default: "" },
  blockchainrecordid: { type: String, trim: true, default: "" },
  history: [{
    action: String,
    stage: String,
    level: Number,
    username: String,
    useremail: String,
    role: String,
    comments: String,
    time: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

purchaseNewInvoiceSchema.index({ colid: 1, status: 1, stage: 1, currentlevel: 1 });
purchaseNewInvoiceSchema.index({ colid: 1, po: 1, vendorusername: 1 });
purchaseNewInvoiceSchema.index({ colid: 1, paymentstatus: 1, invoicedate: 1 });

module.exports = mongoose.model("purchasenewinvoiceds", purchaseNewInvoiceSchema);
