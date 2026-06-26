const mongoose = require("mongoose");

const requisitionStockRegisterSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  store: { type: String, required: true, trim: true },
  itemmasterid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewitemmasterds" },
  requisitionid: { type: mongoose.Schema.Types.ObjectId, ref: "newrequisitionds" },
  category: { type: String, trim: true },
  item: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  unit: { type: String, trim: true },
  transactiontype: { type: String, default: "Issue", trim: true },
  quantityin: { type: Number, default: 0 },
  quantityout: { type: Number, default: 0 },
  balanceafter: { type: Number, default: 0 },
  transactiondate: { type: Date, default: Date.now },
  details: { type: String, trim: true },
  issuedto: { type: String, trim: true },
  issuedtoemail: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.newrequisitionstockregisterds
  || mongoose.model("newrequisitionstockregisterds", requisitionStockRegisterSchema, "newrequisitionstockregisterds");
