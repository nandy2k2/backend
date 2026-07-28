const mongoose = require("mongoose");

const hrLeaveAccrualRuleSchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, required: true },
    leavetype: { type: String, trim: true, required: true },
    minimumdayspresent: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveAccrualRuleSchema.index({ colid: 1, role: 1, leavetype: 1 }, { unique: true });

module.exports = mongoose.models.hrleaveaccrualruleds || mongoose.model("hrleaveaccrualruleds", hrLeaveAccrualRuleSchema);
