const mongoose = require("mongoose");

const bankAttachmentSchema = new mongoose.Schema({
  url: String,
  sourcetype: String,
  filename: String,
  originalname: String,
  mimetype: String,
  size: Number,
  awsconfigid: String,
  bucket: String,
  region: String,
  key: String,
  uploadedat: Date
}, { _id: false });

const userBankAccountSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  owneruser: { type: String, required: true },
  ownername: String,
  ownerrole: String,
  regno: String,
  department: String,
  bankname: { type: String, required: true },
  branchname: String,
  accountholdername: String,
  accountnumber: { type: String, required: true },
  ifsccode: String,
  accounttype: String,
  upiid: String,
  isdefault: { type: String, default: "No" },
  status: { type: String, default: "Active" },
  remarks: String,
  attachment: bankAttachmentSchema,
  createdby: String,
  createdbyname: String,
  updatedby: String,
  updatedbyname: String
}, { timestamps: true });

userBankAccountSchema.index({ colid: 1, owneruser: 1, accountnumber: 1 });

module.exports = mongoose.model("userbankaccountds", userBankAccountSchema);
