const mongoose = require("mongoose");

const purchaseNewVendorSignatorySchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewvendords", required: true, index: true },
  vendorusername: { type: String, trim: true, index: true },
  vendorname: { type: String, trim: true, default: "" },
  name: { type: String, required: true, trim: true },
  designation: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  pannumber: { type: String, trim: true, default: "" },
  aadhaar: { type: String, trim: true, default: "" },
  authorizationdetails: { type: String, trim: true, default: "" },
  documents: [{
    documenttype: String,
    description: String,
    filename: String,
    url: String,
    key: String,
    uploadedat: { type: Date, default: Date.now }
  }],
  status: { type: String, trim: true, default: "Active" }
}, { timestamps: true });

purchaseNewVendorSignatorySchema.index({ colid: 1, vendor: 1, email: 1 });

module.exports = mongoose.model("purchasenewvendorsignatoryds", purchaseNewVendorSignatorySchema);
