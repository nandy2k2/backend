const mongoose = require("mongoose");

const assetNewItemSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  assetid: { type: String, required: true, trim: true },
  barcode: { type: String, trim: true },
  qrcode: { type: String, trim: true },
  itemmasterid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewitemmasterds", index: true },
  store: { type: String, trim: true },
  category: { type: String, trim: true },
  categorytype: { type: String, trim: true },
  item: { type: String, trim: true },
  description: { type: String, trim: true },
  approximateprice: { type: Number, default: 0 },
  unit: { type: String, trim: true },
  dimension: { type: String, trim: true },
  status: { type: String, default: "Available", trim: true, index: true },
  condition: { type: String, default: "Good", trim: true },
  department: { type: String, trim: true },
  assignedto: { type: String, trim: true },
  assignedtoemail: { type: String, trim: true },
  assigneddate: { type: Date },
  requisitionid: { type: mongoose.Schema.Types.ObjectId, ref: "newrequisitionds" },
  lasttrackingid: { type: mongoose.Schema.Types.ObjectId, ref: "assetnewtrackingds" },
  user: { type: String, trim: true }
}, { timestamps: true });

assetNewItemSchema.index({ colid: 1, assetid: 1 }, { unique: true });
assetNewItemSchema.index({ colid: 1, store: 1, category: 1, item: 1, status: 1 });

module.exports = mongoose.models.assetnewitemds
  || mongoose.model("assetnewitemds", assetNewItemSchema, "assetnewitemds");
