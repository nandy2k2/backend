const mongoose = require("mongoose");

const purchaseNewRfpSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  rfpid: { type: String, index: true },
  title: { type: String, required: true },
  category: { type: String },
  categorytype: { type: String },
  officername: { type: String },
  officeremail: { type: String },
  indentids: [{ type: mongoose.Schema.Types.ObjectId, ref: "purchasenewindentds" }],
  items: [{
    indentid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewindentds" },
    department: String,
    requestedby: String,
    requestedbyname: String,
    item: String,
    description: String,
    originalitem: String,
    originaldescription: String,
    quantity: Number,
    approximatevalue: Number,
    approximatetotalcost: Number
  }],
  qualificationcriteria: { type: String },
  experience: { type: String },
  startdatetime: { type: Date },
  enddatetime: { type: Date },
  minimumbid: { type: Number, default: 0 },
  cautiondeposit: { type: Number, default: 0 },
  paymentterms: { type: String },
  refundterms: { type: String },
  deliveryterms: { type: String },
  terms: { type: String },
  documents: [{
    documenttype: String,
    description: String,
    filename: String,
    url: String,
    key: String,
    uploadedby: String,
    uploadedat: { type: Date, default: Date.now }
  }],
  status: { type: String, default: "Draft" },
  stage: { type: String, default: "Draft" },
  currentlevel: { type: Number, default: 0 },
  createdby: { type: String },
  createdbyname: { type: String },
  approvedat: { type: Date },
  rejectedreason: { type: String },
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

purchaseNewRfpSchema.index({ colid: 1, status: 1, stage: 1, currentlevel: 1 });
purchaseNewRfpSchema.index({ colid: 1, category: 1, officeremail: 1 });

module.exports = mongoose.model("purchasenewrfpds", purchaseNewRfpSchema);
