const mongoose = require("mongoose");

const hrLeaveVacationPolicySchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    role: { type: String, trim: true, required: true, index: true },
    vacationid: { type: String, trim: true, index: true },
    vacationtype: { type: String, trim: true, enum: ["half", "full"], default: "full" },
    vacation: { type: String, trim: true, required: true },
    component: { type: String, trim: true, required: true, default: "General" },
    componentorder: { type: Number, default: 1 },
    fromdate: { type: String, trim: true, required: true },
    durationindays: { type: Number, default: 1, min: 1 },
    minworkingdays: { type: Number, default: 0 },
    minworking: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveVacationPolicySchema.index({ colid: 1, academicyear: 1, role: 1, vacation: 1, component: 1, fromdate: 1 });
hrLeaveVacationPolicySchema.index({ colid: 1, academicyear: 1, role: 1, vacation: 1, fromdate: 1, componentorder: 1 });

module.exports = mongoose.model("hrleavevacationpolicyds", hrLeaveVacationPolicySchema);
