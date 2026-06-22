const mongoose = require("mongoose");

const purchaseNewRfpVendorSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  rfp: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewrfpds" },
  rfpid: { type: String, required: true, trim: true, index: true },
  rfptitle: { type: String, trim: true, default: "" },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewvendords" },
  vendorname: { type: String, required: true, trim: true },
  vendorusername: { type: String, trim: true, default: "" },
  vendoremail: { type: String, trim: true, default: "" },
  vendorphone: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Assigned" },
  assignedby: { type: String, trim: true, default: "" },
  assignedbyname: { type: String, trim: true, default: "" },
  assignedat: { type: Date, default: Date.now },
  remarks: { type: String, trim: true, default: "" }
}, { timestamps: true });

purchaseNewRfpVendorSchema.index({ colid: 1, rfpid: 1, vendor: 1 }, { unique: true });
purchaseNewRfpVendorSchema.index({ colid: 1, vendorusername: 1 });

module.exports = mongoose.model("purchasenewrfpvendords", purchaseNewRfpVendorSchema);
