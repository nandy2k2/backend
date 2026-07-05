const mongoose = require("mongoose");

const programPeriodSlotSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    dayofweek: { type: String, trim: true, required: true },
    periodname: { type: String, trim: true, required: true },
    starttime: { type: String, trim: true, required: true },
    endtime: { type: String, trim: true, required: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

programPeriodSlotSchema.index({
  colid: 1,
  academicyear: 1,
  programcode: 1,
  dayofweek: 1,
  periodname: 1
});

module.exports = mongoose.model("programperiodslotds", programPeriodSlotSchema);
