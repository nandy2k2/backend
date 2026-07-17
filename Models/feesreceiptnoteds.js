const mongoose = require("mongoose");

const FeesReceiptNoteSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  title: { type: String, default: "Fees receipt note" },
  note: { type: String, default: "" },
  isactive: { type: String, default: "Yes" },
  createdby: String,
  updatedby: String
}, { timestamps: true });

FeesReceiptNoteSchema.index({ colid: 1, isactive: 1 });

module.exports = mongoose.models.FeesReceiptNoteds || mongoose.model("FeesReceiptNoteds", FeesReceiptNoteSchema);
