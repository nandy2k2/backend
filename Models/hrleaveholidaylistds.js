const mongoose = require("mongoose");

const hrLeaveHolidayListSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    holidaydate: { type: Date, required: true, index: true },
    holidaytype: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveHolidayListSchema.index({ colid: 1, academicyear: 1, holidaydate: 1, holidaytype: 1 }, { unique: true });

module.exports = mongoose.model("hrleaveholidaylistds", hrLeaveHolidayListSchema);
