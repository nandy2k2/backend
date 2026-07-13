const mongoose = require("mongoose");

const assetNewRetirementSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: "assetnewitemds", index: true },
  assetid: { type: String, required: true, trim: true },
  itemmasterid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewitemmasterds" },
  store: { type: String, trim: true },
  category: { type: String, trim: true },
  item: { type: String, trim: true },
  status: { type: String, default: "Retired", trim: true },
  retirementtype: { type: String, trim: true },
  retirementdate: { type: Date, default: Date.now },
  agency: { type: String, trim: true },
  location: { type: String, trim: true },
  recyclevalue: { type: Number, default: 0 },
  details: { type: String, trim: true },
  createdby: { type: String, trim: true },
  createdbyname: { type: String, trim: true }
}, { timestamps: true });

assetNewRetirementSchema.index({ colid: 1, retirementdate: -1 });

module.exports = mongoose.models.assetnewretirementds
  || mongoose.model("assetnewretirementds", assetNewRetirementSchema, "assetnewretirementds");
