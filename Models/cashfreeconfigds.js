const mongoose = require("mongoose");

const cashfreeConfigSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" },
  appid: { type: String, required: true, trim: true },
  secretkey: { type: String, required: true, trim: true },
  environment: { type: String, enum: ["sandbox", "production"], default: "sandbox" },
  apiVersion: { type: String, trim: true, default: "2023-08-01" },
  returnurl: { type: String, trim: true, default: "" },
  notifyurl: { type: String, trim: true, default: "" },
  isactive: { type: Boolean, default: true },
  notes: { type: String, trim: true, default: "" }
}, { timestamps: true });

cashfreeConfigSchema.index({ colid: 1, isactive: 1 });

module.exports = mongoose.models.cashfreeconfigds || mongoose.model("cashfreeconfigds", cashfreeConfigSchema);
