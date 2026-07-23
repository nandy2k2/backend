const mongoose = require("mongoose");

const hrShiftAllocationSchema = new mongoose.Schema(
  {
    employee: { type: String, trim: true, required: true },
    employeeemail: { type: String, trim: true, required: true, index: true },
    shift: { type: String, trim: true, required: true },
    location: { type: String, trim: true },
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

hrShiftAllocationSchema.index({ colid: 1, employeeemail: 1, shift: 1 });

module.exports = mongoose.model("hrshiftallocationds", hrShiftAllocationSchema);
