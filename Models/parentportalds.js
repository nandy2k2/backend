const mongoose = require("mongoose");

const parentPortalSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    parentname: { type: String, trim: true, required: true },
    email: { type: String, trim: true, required: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    pin: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    occupation: { type: String, trim: true },
    income: { type: String, trim: true },
    caste: { type: String, trim: true },
    password: { type: String, trim: true, default: "Password@123" },
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

parentPortalSchema.index({ colid: 1, email: 1 }, { unique: true });

module.exports = mongoose.models.parentportalds || mongoose.model("parentportalds", parentPortalSchema);
