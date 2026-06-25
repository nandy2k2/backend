const mongoose = require("mongoose");

const purchaseNewStoreWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  store: { type: String, required: true },
  level: { type: Number, required: true },
  approverrole: { type: String, required: true },
  approvername: { type: String },
  approveremail: { type: String },
  active: { type: String, default: "Yes" },
  remarks: { type: String },
  user: { type: String }
}, { timestamps: true });

purchaseNewStoreWorkflowSchema.index({ colid: 1, store: 1, level: 1 });

module.exports = mongoose.model("purchasenewstoreworkflowds", purchaseNewStoreWorkflowSchema);
