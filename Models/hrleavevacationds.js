const mongoose = require("mongoose");

const hrLeaveVacationSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    role: { type: String, trim: true, required: true, index: true },
    vacation: { type: String, trim: true, required: true },
    fromdate: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveVacationSchema.index({ colid: 1, academicyear: 1, role: 1, vacation: 1, fromdate: 1 });

module.exports = mongoose.model("hrleavevacationds", hrLeaveVacationSchema);
