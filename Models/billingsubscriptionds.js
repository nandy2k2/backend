const mongoose = require("mongoose");

const BillingSubscriptionSchema = new mongoose.Schema({
  colid: { type: Number, required: true, unique: true, index: true },
  active: { type: String, enum: ["Yes", "No"], default: "Yes" },
  reason: String,
  user: String,
  username: String
}, { timestamps: true });

module.exports = mongoose.model("billingsubscriptionds", BillingSubscriptionSchema);
