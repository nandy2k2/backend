const mongoose = require("mongoose");

const placementNewCompanySchema = new mongoose.Schema(
  {
    company: { type: String, trim: true, required: true },
    companyemail: { type: String, trim: true },
    contactnumber: { type: String, trim: true },
    industry: { type: String, trim: true },
    login: { type: String, trim: true },
    password: { type: String, trim: true },
    address: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewCompanySchema.index({ colid: 1, company: 1, companyemail: 1 });

module.exports = mongoose.models.placementnewcompanyds || mongoose.model("placementnewcompanyds", placementNewCompanySchema);
