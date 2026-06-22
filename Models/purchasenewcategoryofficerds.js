const mongoose = require("mongoose");

const purchaseNewCategoryOfficerSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  category: { type: String, required: true, index: true },
  categorytype: { type: String },
  officername: { type: String },
  officeremail: { type: String, required: true, index: true },
  active: { type: String, default: "Yes" },
  remarks: { type: String },
  user: { type: String }
}, { timestamps: true });

purchaseNewCategoryOfficerSchema.index({ colid: 1, category: 1, officeremail: 1 });

module.exports = mongoose.model("purchasenewcategoryofficerds", purchaseNewCategoryOfficerSchema);
