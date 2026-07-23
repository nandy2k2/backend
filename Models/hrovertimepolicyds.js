const mongoose = require("mongoose");

const hrOvertimePolicySchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, required: true },
    hourlyrate: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrOvertimePolicySchema.index({ colid: 1, role: 1 });

module.exports = mongoose.model("hrovertimepolicyds", hrOvertimePolicySchema);
