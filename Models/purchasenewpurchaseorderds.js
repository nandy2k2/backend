const mongoose = require("mongoose");

const purchaseNewPurchaseOrderSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  poid: { type: String, required: true, trim: true, index: true },
  title: { type: String, trim: true, default: "" },
  rfp: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewrfpds" },
  rfpid: { type: String, trim: true, index: true },
  rfptitle: { type: String, trim: true, default: "" },
  submission: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewrfpsubmissionds" },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewvendords" },
  vendorname: { type: String, trim: true, default: "" },
  vendorusername: { type: String, trim: true, index: true },
  vendoremail: { type: String, trim: true, default: "" },
  items: [{
    item: String,
    description: String,
    quantity: Number,
    unitprice: Number,
    gstpercent: Number,
    gstamount: Number,
    freightcost: Number,
    loadingcost: Number,
    customscost: Number,
    installationcost: Number,
    othercost: Number,
    total: Number
  }],
  subtotal: { type: Number, default: 0 },
  gsttotal: { type: Number, default: 0 },
  grandtotal: { type: Number, default: 0 },
  paymentterms: { type: String, trim: true, default: "" },
  deliveryterms: { type: String, trim: true, default: "" },
  penaltyclause: { type: String, trim: true, default: "" },
  generalterms: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Draft", index: true },
  stage: { type: String, trim: true, default: "Draft" },
  currentlevel: { type: Number, default: 0 },
  createdby: { type: String, trim: true, default: "" },
  createdbyname: { type: String, trim: true, default: "" },
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

purchaseNewPurchaseOrderSchema.index({ colid: 1, status: 1, stage: 1, currentlevel: 1 });
purchaseNewPurchaseOrderSchema.index({ colid: 1, vendorusername: 1 });

module.exports = mongoose.model("purchasenewpurchaseorderds", purchaseNewPurchaseOrderSchema);
