const mongoose = require("mongoose");

const purchaseNewRfpSubmissionSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  rfp: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewrfpds", required: true, index: true },
  rfpid: { type: String, required: true, trim: true, index: true },
  rfptitle: { type: String, trim: true, default: "" },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewvendords", required: true, index: true },
  vendorname: { type: String, required: true, trim: true },
  vendorusername: { type: String, trim: true, index: true },
  vendoremail: { type: String, trim: true, default: "" },
  items: [{
    rfpitemindex: Number,
    item: String,
    description: String,
    quantity: Number,
    unitprice: { type: Number, default: 0 },
    gstpercent: { type: Number, default: 0 },
    gstamount: { type: Number, default: 0 },
    freightcost: { type: Number, default: 0 },
    loadingcost: { type: Number, default: 0 },
    customscost: { type: Number, default: 0 },
    installationcost: { type: Number, default: 0 },
    othercost: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }],
  qualificationresponse: { type: String, trim: true, default: "" },
  experienceresponse: { type: String, trim: true, default: "" },
  technicalbid: { type: String, trim: true, default: "" },
  financialremarks: { type: String, trim: true, default: "" },
  subtotal: { type: Number, default: 0 },
  gsttotal: { type: Number, default: 0 },
  grandtotal: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "Submitted", index: true },
  editable: { type: String, trim: true, default: "No" },
  submittedat: { type: Date, default: Date.now },
  resubmittedat: { type: Date },
  documents: [{
    documenttype: String,
    description: String,
    filename: String,
    url: String,
    key: String,
    uploadedat: { type: Date, default: Date.now }
  }],
  blockchainhash: { type: String, trim: true, default: "" },
  blockchainrecordid: { type: String, trim: true, default: "" }
}, { timestamps: true });

purchaseNewRfpSubmissionSchema.index({ colid: 1, rfpid: 1, vendor: 1 }, { unique: true });

module.exports = mongoose.model("purchasenewrfpsubmissionds", purchaseNewRfpSubmissionSchema);
