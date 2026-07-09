const mongoose = require("mongoose");

const miscellaneousAmountSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  academicyear: { type: String },
  feegroup: { type: String, default: "Miscellaneous" },
  feeitem: { type: String, required: true },
  description: { type: String },
  amount: { type: Number, default: 0 },
  feebook: { type: String },
  cashbook: { type: String },
  feecategory: { type: String, default: "Miscellaneous" },
  feetype: { type: String, default: "Miscellaneous" },
  status: { type: String, default: "Active" },
  user: { type: String },
  name: { type: String }
}, { timestamps: true });

miscellaneousAmountSchema.index({ colid: 1, academicyear: 1 });
miscellaneousAmountSchema.index({ colid: 1, feeitem: 1 });
miscellaneousAmountSchema.index({ colid: 1, status: 1 });

module.exports = mongoose.model("Miscellaneousamountds", miscellaneousAmountSchema);
