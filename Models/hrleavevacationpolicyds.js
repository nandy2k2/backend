const mongoose = require("mongoose");

const hrLeaveVacationPolicySchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    role: { type: String, trim: true, required: true, index: true },
    vacationtype: { type: String, trim: true, enum: ["half", "full"], default: "full" },
    vacation: { type: String, trim: true, required: true },
    fromdate: { type: String, trim: true, required: true },
    todate: { type: String, trim: true, required: true },
    minworking: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveVacationPolicySchema.index({ colid: 1, academicyear: 1, role: 1, vacation: 1, fromdate: 1 });

module.exports = mongoose.model("hrleavevacationpolicyds", hrLeaveVacationPolicySchema);
