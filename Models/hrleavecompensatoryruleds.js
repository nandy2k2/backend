const mongoose = require("mongoose");

const hrLeaveCompensatoryRuleSchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, required: true },
    leavestoadd: { type: Number, default: 1 },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveCompensatoryRuleSchema.index({ colid: 1, role: 1 }, { unique: true });

module.exports = mongoose.model("hrleavecompensatoryruleds", hrLeaveCompensatoryRuleSchema);
