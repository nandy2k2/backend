const mongoose = require("mongoose");

const purchaseNewVendorSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  companyname: { type: String, required: true, trim: true },
  type: { type: String, trim: true, default: "Pvt Ltd" },
  address: { type: String, trim: true, default: "" },
  gstno: { type: String, trim: true, default: "" },
  panno: { type: String, trim: true, default: "" },
  tanno: { type: String, trim: true, default: "" },
  contactperson: { type: String, trim: true, default: "" },
  contactemail: { type: String, trim: true, default: "" },
  contactphone: { type: String, trim: true, default: "" },
  specialization: { type: String, trim: true, default: "" },
  pastrecords: { type: String, trim: true, default: "" },
  bankdetails: { type: String, trim: true, default: "" },
  documents: [{
    documenttype: String,
    description: String,
    filename: String,
    url: String,
    key: String,
    uploadedat: { type: Date, default: Date.now }
  }],
  username: { type: String, required: true, trim: true },
  password: { type: String, required: true, trim: true },
  status: { type: String, trim: true, default: "Active" },
  remarks: { type: String, trim: true, default: "" },
  createdby: { type: String, trim: true, default: "" },
  createdbyname: { type: String, trim: true, default: "" }
}, { timestamps: true });

purchaseNewVendorSchema.index({ colid: 1, username: 1 }, { unique: true });
purchaseNewVendorSchema.index({ colid: 1, companyname: 1 });

module.exports = mongoose.model("purchasenewvendords", purchaseNewVendorSchema);
