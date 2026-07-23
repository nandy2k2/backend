const mongoose = require("mongoose");

const hrShiftTimingSchema = new mongoose.Schema(
  {
    location: { type: String, trim: true },
    shift: { type: String, trim: true, required: true },
    starttime: { type: String, trim: true },
    endtime: { type: String, trim: true },
    lateaftertime: { type: String, trim: true },
    earlybeforetime: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrShiftTimingSchema.index({ colid: 1, location: 1, shift: 1 });

module.exports = mongoose.model("hrshifttimingds", hrShiftTimingSchema);
