const mongoose = require("mongoose");

const hrLatePolicySchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, required: true },
    fromdays: { type: Number, default: 1 },
    todays: { type: Number, default: 999 },
    dailysalarypercentage: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLatePolicySchema.index({ colid: 1, role: 1, fromdays: 1, todays: 1 });

module.exports = mongoose.model("hrlatepolicyds", hrLatePolicySchema);
