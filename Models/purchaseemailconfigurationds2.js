const mongoose = require("mongoose");

const PurchaseEmailConfigurationSchema = new mongoose.Schema({
  colid: {
    type: Number,
    required: true,
    index: true
  },
  name: String,
  user: String,
  category: {
    type: String,
    enum: ["PR", "Indent", "PO"],
    required: true
  },
  recipient: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: "Active"
  }
}, { timestamps: true });

PurchaseEmailConfigurationSchema.index({ colid: 1, category: 1, status: 1 });

module.exports = mongoose.models.purchaseemailconfigurationds2 || mongoose.model("purchaseemailconfigurationds2", PurchaseEmailConfigurationSchema);
