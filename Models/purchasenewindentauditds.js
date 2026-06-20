const mongoose = require("mongoose");

const purchaseNewIndentAuditSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  indentid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewindentds" },
  department: { type: String },
  category: { type: String },
  categorytype: { type: String },
  item: { type: String },
  action: { type: String, required: true },
  status: { type: String },
  stage: { type: String },
  level: { type: Number },
  comments: { type: String },
  username: { type: String },
  useremail: { type: String },
  role: { type: String },
  olddata: { type: mongoose.Schema.Types.Mixed },
  newdata: { type: mongoose.Schema.Types.Mixed },
  timeofactivity: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("purchasenewindentauditds", purchaseNewIndentAuditSchema);
