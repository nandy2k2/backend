const mongoose = require("mongoose");

const institutionBankAccountSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    institution: { type: String, trim: true, required: true, index: true },
    institutioncode: { type: String, trim: true },
    accountnumber: { type: String, trim: true, required: true },
    ifsccode: { type: String, trim: true },
    accountholdername: { type: String, trim: true },
    accounttype: { type: String, trim: true },
    bank: { type: String, trim: true },
    branch: { type: String, trim: true },
    location: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

institutionBankAccountSchema.index({ colid: 1, institution: 1, accountnumber: 1 }, { unique: true });

module.exports = mongoose.models.institutionbankaccountds || mongoose.model("institutionbankaccountds", institutionBankAccountSchema);
