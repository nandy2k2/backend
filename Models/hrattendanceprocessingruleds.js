const mongoose = require("mongoose");

const hrAttendanceProcessingRuleSchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, required: true },
    leavecheck: { type: String, trim: true, default: "Yes" },
    holidaycheck: { type: String, trim: true, default: "Yes" },
    weeklyoffcheck: { type: String, trim: true, default: "Yes" },
    shiftcheck: { type: String, trim: true, default: "Yes" },
    workinghourscheck: { type: String, trim: true, default: "Yes" },
    minworkinghours: { type: Number, default: 8 },
    compoffupdate: { type: String, trim: true, default: "Yes" },
    lateadjustleavetype: { type: String, trim: true },
    lopleavetype: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrAttendanceProcessingRuleSchema.index({ colid: 1, role: 1 });

module.exports = mongoose.model("hrattendanceprocessingruleds", hrAttendanceProcessingRuleSchema);
