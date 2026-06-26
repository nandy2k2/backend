const mongoose = require("mongoose");

const purchaseNewItemMasterSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  store: { type: String, required: true, trim: true },
  storedescription: { type: String, trim: true },
  category: { type: String, required: true, trim: true },
  categorytype: { type: String, trim: true },
  item: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  approximateprice: { type: Number, default: 0 },
  quantityavailable: { type: Number, default: 0 },
  unit: { type: String, trim: true },
  dimension: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true }
}, { timestamps: true });

purchaseNewItemMasterSchema.index({ colid: 1, store: 1, category: 1, item: 1 });

module.exports = mongoose.model("purchasenewitemmasterds", purchaseNewItemMasterSchema);
