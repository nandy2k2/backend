const mongoose = require("mongoose");

const hrLeaveNewJoineeRuleSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, trim: true },
    leavetype: { type: String, required: true, trim: true },
    coolingoffdays: { type: Number, default: 0 },
    status: { type: String, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String }
  },
  { timestamps: true }
);

hrLeaveNewJoineeRuleSchema.index({ colid: 1, role: 1, leavetype: 1 });

module.exports = mongoose.model("hrleavenewjoineeruleds", hrLeaveNewJoineeRuleSchema);
