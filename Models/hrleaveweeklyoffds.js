const mongoose = require("mongoose");

const hrLeaveWeeklyOffSchema = new mongoose.Schema(
  {
    employeename: { type: String, trim: true },
    employeeemail: { type: String, trim: true, required: true, index: true },
    role: { type: String, trim: true },
    department: { type: String, trim: true },
    dayofweek: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveWeeklyOffSchema.index({ colid: 1, employeeemail: 1, dayofweek: 1 }, { unique: true });

module.exports = mongoose.model("hrleaveweeklyoffds", hrLeaveWeeklyOffSchema);
