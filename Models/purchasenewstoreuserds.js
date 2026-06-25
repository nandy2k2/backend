const mongoose = require("mongoose");

const purchaseNewStoreUserSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  store: { type: String, required: true, trim: true },
  storedescription: { type: String, trim: true },
  username: { type: String, trim: true },
  useremail: { type: String, required: true, trim: true },
  role: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true }
}, { timestamps: true });

purchaseNewStoreUserSchema.index({ colid: 1, store: 1, useremail: 1 });

module.exports = mongoose.model("purchasenewstoreuserds", purchaseNewStoreUserSchema);
