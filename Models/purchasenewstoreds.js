const mongoose = require("mongoose");

const purchaseNewStoreSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  store: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true }
}, { timestamps: true });

purchaseNewStoreSchema.index({ colid: 1, store: 1 });

module.exports = mongoose.model("purchasenewstoreds", purchaseNewStoreSchema);
